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
        // --- 1. COMANDO DE BAIXA DIRETA (Ex: "id 3") ---
        if (textoLow.startsWith("id ") && !sessoesEncomenda[jid]) {
            const idBuscado = textoLow.replace(/\D/g, "").trim(); // Limpeza de segurança
            if (!idBuscado) return sock.sendMessage(grupoId, { text: "❌ Informe o número do ID (Ex: id 2)" });

            sessoesEncomenda[jid] = { etapa: "pergunta_quem_recebeu", idParaBaixa: idBuscado };
            return sock.sendMessage(grupoId, { text: `🤝 *ID ${idBuscado} localizado!* \n\nInforme quem está recebendo a encomenda agora? (Nome ou 'Vizinho')` });
        }

        // --- 2. MENU E VOLTAR ---
        if (["menu", "sair", "oi", "ola"].includes(textoLow)) {
            delete sessoesEncomenda[jid];
            const saudacao = obterSaudacao();
            const menu = `📦 ${saudacao}!\n\n*JK UNIVERSITÁRIO - ENCOMENDAS*\n\n1️⃣ Registrar encomenda\n2️⃣ Consultar encomenda\n3️⃣ Registrar recebimento\n4️⃣ Ver Histórico\n\n👉 _Digite o número desejado ou use "ID [número]"_`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- 3. LÓGICA DE REGISTRO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            sessoesEncomenda[jid].dataPrevista = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Amazon, Shopee):" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Informe o seu nome:" });
        }

        // --- BLOCO ATUALIZADO: PERGUNTA NOME + CONFIRMAÇÃO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_nome") {
            const dados = sessoesEncomenda[jid];
            const nomeInquilino = textoRaw.toUpperCase();

            await axios.post(URL, { 
                action: "registrar", 
                dataPrevista: dados.dataPrevista, 
                loja: dados.loja, 
                nome: nomeInquilino, 
                usuario: jid 
            });

            // Mensagem personalizada com menção e detalhes
            const mensagemConfirmacao = `✅ Ok, *${nomeInquilino}* (@${jid.split("@")[0]}), sua compra da *${dados.loja}* com previsão para *${dados.dataPrevista}* foi anotada!\n\n🔔 Fique atento(a) para registrar o recebimento aqui no grupo quando chegar.`;

            delete sessoesEncomenda[jid];

            return sock.sendMessage(grupoId, { 
                text: mensagemConfirmacao, 
                mentions: [jid] 
            });
        }

        // --- 4. LÓGICA DE RECEBIMENTO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_id_baixa") {
            const idLimpo = textoRaw.replace(/\D/g, "").trim(); // Limpeza de segurança
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
                if (lista.length === 0) return sock.sendMessage(grupoId, { text: "📭 Não há encomendas aguardando." });
                let msgLista = "🔍 *ENCOMENDAS AGUARDANDO:*\n\n";
                lista.forEach(r => msgLista += `🆔 *ID:* ${r[0]} | 👤 ${r[3]} (${r[2]})\n`);
                return sock.sendMessage(grupoId, { text: msgLista });
            }

            case "3": {
                const resBaixa = await axios.post(URL, { action: "consultar" });
                const listaB = resBaixa.data.lista || [];
                if (listaB.length === 0) return sock.sendMessage(grupoId, { text: "📭 Nada para receber." });
                sessoesEncomenda[jid] = { etapa: "pergunta_id_baixa" };
                let msgBaixa = "📦 *CONFIRMAR RECEBIMENTO*\nDigite apenas o número do ID:\n\n";
                listaB.forEach(r => msgBaixa += `🆔 *ID ${r[0]}* - ${r[3]}\n`);
                return sock.sendMessage(grupoId, { text: msgBaixa });
            }

            case "4": {
                const resHist = await axios.post(URL, { action: "historico" });
                const listaH = resHist.data.lista || [];
                if (listaH.length === 0) return sock.sendMessage(grupoId, { text: "📜 Histórico vazio." });
                let msgHist = "📜 *ÚLTIMAS ENTREGAS:*\n\n";
                listaH.forEach(r => msgHist += `✅ *ID ${r[0]}:* ${r[3]} | Chegou: ${r[6]}\n`);
                return sock.sendMessage(grupoId, { text: msgHist });
            }
        }
    } catch (error) {
        return sock.sendMessage(grupoId, { text: "❌ Sistema temporariamente indisponível." });
    }
}

export function configurarEventosEncomendas(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participante = num.participants[0];
        const saudacao = obterSaudacao();

        if (num.action === 'add') {
            const boasVindas = `📦 ${saudacao}! Seja bem-vindo(a) à **JK Universitário** @${participante.split('@')[0]}!\n\n` +
                               `Este é o nosso canal para **Encomendas**. Use o comando *Menu* para começar! 🚀`;
            await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
            await axios.post(URL, { action: "log_evento", usuario: participante, evento: "ENTROU" }).catch(() => {});
        }
    });
}
