import axios from "axios";
import moment from "moment-timezone";

const URL = process.env.URL_GOOGLE_ENCOMENDAS;
const TIMEZONE = "America/Sao_Paulo";
let sessoesEncomenda = {}; 

const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const jid = msg.key.participant || msg.key.remoteJid;
    const textoRaw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const textoLow = textoRaw.toLowerCase();

    if (!URL) return console.error("ERRO: URL_GOOGLE_ENCOMENDAS não definida!");

    try {
        // --- 1. COMANDO DE BAIXA DIRETA ---
        if (textoLow.startsWith("id ") && !sessoesEncomenda[jid]) {
            const idBuscado = textoLow.replace(/\D/g, "").trim();
            if (!idBuscado) return sock.sendMessage(grupoId, { text: "❌ Informe o número do ID (Ex: id 2)" });

            sessoesEncomenda[jid] = { etapa: "pergunta_quem_recebeu", idParaBaixa: idBuscado };
            return sock.sendMessage(grupoId, { text: `🤝 *ID ${idBuscado} localizado!* \n\nInforme quem está recebendo a encomenda agora?` });
        }

        // --- 2. MENU E VOLTAR ---
        if (["menu", "sair", "oi", "ola"].includes(textoLow)) {
            delete sessoesEncomenda[jid];
            const saudacao = obterSaudacao();
            const menu = `📦 ${saudacao}!\n\n*JK UNIVERSITÁRIO - ENCOMENDAS*\n\n1️⃣ Registrar encomenda\n2️⃣ Consultar encomenda\n3️⃣ Registrar recebimento\n4️⃣ Ver Histórico\n\n👉 _Digite o número desejado ou use "ID [número]"_`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- 3. LÓGICA DE REGISTRO ---
        
        // ETAPA: RECEBER DATA E FORMATAR COM ANO
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            let dataDigitada = textoRaw;
            
            // Se o usuário digitar "20/04", o moment completa com o ano atual
            // Se ele digitar "20/04/2026", ele mantém
            const dataFormatada = moment(dataDigitada, "DD/MM", true).isValid() 
                ? moment(dataDigitada, "DD/MM").format("DD/MM/YYYY") 
                : dataDigitada;

            sessoesEncomenda[jid].dataPrevista = dataFormatada;
            sessoesEncomenda[jid].etapa = "pergunta_lo_ja"; // Corrigido para bater com a próxima etapa
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Amazon, Shopee):" });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Informe o seu nome:" });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_nome") {
            const dados = sessoesEncomenda[jid];
            const nomeInquilino = textoRaw.toUpperCase();

            await axios.post(URL, { 
                action: "registrar", 
                dataPrevista: dados.dataPrevista, // Aqui já vai com o ano (Ex: 20/04/2026)
                loja: dados.loja, 
                nome: nomeInquilino, 
                usuario: jid 
            });

            const mensagemConfirmacao = `✅ Ok, *${nomeInquilino}* (@${jid.split("@")[0]}), sua compra da *${dados.loja}* com previsão para *${dados.dataPrevista}* foi anotada!\n\n🔔 Fique atento(a) para registrar o recebimento aqui no grupo quando chegar.`;

            delete sessoesEncomenda[jid];
            return sock.sendMessage(grupoId, { text: mensagemConfirmacao, mentions: [jid] });
        }

        // --- 4. LÓGICA DE RECEBIMENTO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_id_baixa") {
            const idLimpo = textoRaw.replace(/\D/g, "").trim();
            sessoesEncomenda[jid].idParaBaixa = idLimpo;
            sessoesEncomenda[jid].etapa = "pergunta_quem_recebeu";
            return sock.sendMessage(grupoId, { text: `🤝 Entendido. E quem está recebendo a encomenda do ID ${idLimpo}?` });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_quem_recebeu") {
            const idBuscado = sessoesEncomenda[jid].idParaBaixa;
            const quemRecebeu = textoRaw;

            const res = await axios.post(URL, { 
                action: "receber", 
                id: idBuscado,
                dataChegada: moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm"),
                quemRecebeu: quemRecebeu 
            });

            if (res.data.status === "success") {
                const donoJid = res.data.dono;
                const msgSucesso = `✅ *ENCOMENDA ENTREGUE!*\n\n📦 *ID:* ${idBuscado}\n👤 *Recebido por:* ${quemRecebeu}\n🔔 *Aviso:* @${donoJid.split("@")[0]}, sua encomenda chegou!`;
                delete sessoesEncomenda[jid];
                return sock.sendMessage(grupoId, { text: msgSucesso, mentions: [donoJid] });
            } else {
                delete sessoesEncomenda[jid];
                return sock.sendMessage(grupoId, { text: `❌ Erro: ID *${idBuscado}* não encontrado.` });
            }
        }

        // --- 5. OPÇÕES DO MENU ---
        switch (textoLow) {
            case "1":
                sessoesEncomenda[jid] = { etapa: "pergunta_data" };
                return sock.sendMessage(grupoId, { text: "📅 Qual a data prevista? (Ex: 10/04)" });
            case "2": {
    const resCons = await axios.post(URL, { action: "consultar" });
    const lista = resCons.data.lista || [];
    
    if (lista.length === 0) {
        return sock.sendMessage(grupoId, { text: "📭 *Não há encomendas aguardando no momento.*" });
    }

    let msgLista = "🔍 *ENCOMENDAS AGUARDANDO:*\n";
    msgLista += "__________________________\n\n";

    lista.forEach(r => {
        // r[0] = ID, r[1] = Data, r[2] = Loja, r[3] = Nome
        msgLista += `🆔 *ID: ${r[0]}*\n`;
        msgLista += `👤 *NOME:* ${r[3]}\n`;
        msgLista += `🛍️ *LOJA:* ${r[2]}\n`;
        msgLista += `📅 *CHEGA EM:* ${r[1]}\n`; // <--- Aqui mostra a data
        msgLista += "__________________________\n\n";
    });

    msgLista += "_Para dar baixa, digite: ID [número]_";
    return sock.sendMessage(grupoId, { text: msgLista });
}
            case "3": {
                const resBaixa = await axios.post(URL, { action: "consultar" });
                const listaB = resBaixa.data.lista || [];
                if (listaB.length === 0) return sock.sendMessage(grupoId, { text: "📭 Nada para receber." });
                sessoesEncomenda[jid] = { etapa: "pergunta_id_baixa" };
                let msgBaixa = "📦 *CONFIRMAR RECEBIMENTO*\nDigite o número do ID:\n\n";
                listaB.forEach(r => msgBaixa += `🆔 *ID ${r[0]}* - ${r[3]}\n`);
                return sock.sendMessage(grupoId, { text: msgBaixa });
            }
           case "4": {
                const resHist = await axios.post(URL, { action: "historico" });
                const listaH = resHist.data.lista || [];

                if (listaH.length === 0) {
                    return sock.sendMessage(grupoId, { text: "📜 *O histórico de entregas está vazio.*" });
                }

                let msgHist = "📜 *ÚLTIMAS ENTREGAS REALIZADAS*\n";
                msgHist += "__________________________\n\n";

                listaH.slice(-10).reverse().forEach(r => {
                    msgHist += `✅ *ID ${r[0]}* | ${r[3]}\n`;
                    msgHist += `📦 *ORIGEM:* ${r[2].toUpperCase()}\n`; 
                    msgHist += `🏁 *ENTREGUE EM:* ${r[6]}\n`;
                    msgHist += "__________________________\n\n";
                });

                return sock.sendMessage(grupoId, { text: msgHist });
            }
        } // Fim do switch
    } catch (error) { // Fim do try
        return sock.sendMessage(grupoId, { text: "❌ Sistema temporariamente indisponível." });
    }
} // Fim da função tratarMensagemEncomendas

export function configurarEventosEncomendas(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participante = num.participants[0];
        const saudacao = obterSaudacao();
        if (num.action === 'add') {
            const boasVindas = `📦 ${saudacao}! Bem-vindo(a) @${participante.split('@')[0]}! Use *Menu* para gerenciar suas encomendas. 🚀`;
            await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
        }
    });
}
