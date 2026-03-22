import axios from "axios";
import moment from "moment-timezone";

const URL = process.env.URL_GOOGLE_ENCOMENDAS;
const TIMEZONE = "America/Sao_Paulo";
let sessoesEncomenda = {}; 

// --- FUNÇÃO PARA SAUDAÇÃO DINÂMICA ---
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
        if (textoLow.startsWith("id ")) {
            const idBuscado = textoLow.replace("id ", "").trim();
            const res = await axios.post(URL, { 
                action: "receber", 
                id: idBuscado,
                dataChegada: new Date().toLocaleString("pt-BR"),
                quemRecebeu: "Portaria JK" 
            });

            if (res.data.result === "success") {
                const donoJid = res.data.dono;
                return sock.sendMessage(grupoId, { 
                    text: `✅ Encomenda *ID ${idBuscado}* CHEGOU!\n\n🔔 @${donoJid.split("@")[0]}, verifique se está na mesa churrasqueira na casa do Antônio!`,
                    mentions: [donoJid]
                });
            } else {
                return sock.sendMessage(grupoId, { text: `❌ ID *${idBuscado}* não encontrado ou já entregue.` });
            }
        }

        // --- 2. MENU E VOLTAR ---
        if (textoLow === "menu" || textoLow === "sair") {
            delete sessoesEncomenda[jid];
            const saudacao = obterSaudacao();
            const menu = `📦 ${saudacao}!\n\n*JK UNIVERSITÁRIO - ENCOMENDAS E AVISOS*\n\n1️⃣ Registrar encomenda\n2️⃣ Consultar encomenda\n3️⃣ Registrar recebimento\n4️⃣ Ver Histórico\n\n👉 _Digite o número ou use "ID [número]"_`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- 3. LÓGICA DE REGISTRO (ETAPAS) ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            sessoesEncomenda[jid].dataPrevista = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Amazon, Shopee,Mercado Livre, Delivery e etc):" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Informe o seu nome?" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_nome") {
            const dados = sessoesEncomenda[jid];
            await axios.post(URL, { 
                action: "registrar", 
                dataPrevista: dados.dataPrevista, 
                loja: dados.loja, 
                apto: textoRaw.toUpperCase(), 
                usuario: jid 
            });
            delete sessoesEncomenda[jid];
            return sock.sendMessage(grupoId, { text: `✅ Previsão para *${textoRaw.toUpperCase()}* anotada!` });
        }

        // --- 4. OPÇÕES DO MENU ---
        switch (textoLow) {
            case "1":
                sessoesEncomenda[jid] = { etapa: "pergunta_data" };
                return sock.sendMessage(grupoId, { text: "📅 Qual a data prevista? (Ex: 25/03)" });
            case "2":
                const resCons = await axios.post(URL, { action: "consultar" });
                const listaC = resCons.data.lista.map(r => `• ID: ${r[0]} - ${r[2]} (*${r[3]}*)`).join("\n");
                return sock.sendMessage(grupoId, { text: `🔍 *ESPERADAS:*\n\n${listaC || "Vazio."}` });
            case "3":
                const resBaixa = await axios.post(URL, { action: "consultar" });
                if (!resBaixa.data.lista?.length) return sock.sendMessage(grupoId, { text: "📭 Nada para receber." });
                let msgBaixa = "📦 *CONFIRMAR CHEGADA*\nDigite *ID* + o número correspondente:\n\n";
                resBaixa.data.lista.forEach(r => msgBaixa += `🆔 *ID ${r[0]}* - ${r[2]} (${r[3]})\n`);
                return sock.sendMessage(grupoId, { text: msgBaixa });
            case "4":
                const resHist = await axios.post(URL, { action: "historico" });
                const listaH = resHist.data.lista.map(r => `✅ *${r[3]}* - ${r[2]} (${r[6]})`).join("\n");
                return sock.sendMessage(grupoId, { text: `📜 *ÚLTIMAS ENTREGAS:*\n\n${listaH || "Vazio."}` });
        }
    } catch (error) {
        console.error("Erro Encomendas:", error.message);
        return sock.sendMessage(grupoId, { text: "❌ Erro na comunicação com o sistema." });
    }
}

// --- MONITOR DE PARTICIPANTES ---
export function configurarEventosEncomendas(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participante = num.participants[0];
        const saudacao = obterSaudacao();

        if (num.action === 'add') {
            const boasVindas = `📦 ${saudacao}! Seja bem-vindo(a) à **JK Universitário** @${participante.split('@')[0]}!\n\n` +
                               `Este é o nosso canal oficial para **Encomendas e Avisos Gerais**. 📢\n\n` +
                               `• *Encomendas:* Registre suas previsões aqui. Quando chegar e alguem receber, avisamos por aqui!\n` +
                               `• *Comunicados:* Fique atento a este grupo para avisos de manutenção, coleta de lixo e informações importantes da pousada.\n\n` +
                               `Use o comando *Menu* para ver as opções! 🚀`;
            
            await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
            
            await axios.post(URL, { action: "log_evento", usuario: participante, evento: "ENTROU" }).catch(() => {});
        }

        if (num.action === 'remove') {
            const adeus = `👋 O morador @${participante.split('@')[0]} saiu do grupo de encomendas.`;
            await sock.sendMessage(idGrupo, { text: adeus, mentions: [participante] });
            
            await axios.post(URL, { action: "log_evento", usuario: participante, evento: "SAIU" }).catch(() => {});
        }
    });
}
