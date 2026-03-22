import axios from "axios";
const URL = process.env.URL_GOOGLE_ENCOMENDAS;
let sessoesEncomenda = {}; 

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const jid = msg.key.participant || msg.key.remoteJid;
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const textoLow = texto.toLowerCase();

    // Resetar sessão se digitar menu
    if (textoLow === "menu") {
        delete sessoesEncomenda[jid];
        const menu = `📦 *ENCOMENDAS JK*\n\n1️⃣ Registrar previsão\n2️⃣ Consultar esperadas\n3️⃣ Confirmar chegada (Baixa)\n4️⃣ Ver Histórico de Entregas`;
        return sock.sendMessage(grupoId, { text: menu });
    }

    // --- OPÇÃO 1: REGISTRAR ---
    if (texto === "1") {
        sessoesEncomenda[jid] = { etapa: "pergunta_data" };
        return sock.sendMessage(grupoId, { text: "📅 Qual a data prevista para a chegada? (Ex: 01/01/1900)" });
    }
    if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
        sessoesEncomenda[jid].dataPrevista = texto;
        sessoesEncomenda[jid].etapa = "pergunta_loja";
        return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Mercado Livre, Amazon, Shopee, etc):" });
    }
    if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
        sessoesEncomenda[jid].loja = texto;
        sessoesEncomenda[jid].etapa = "pergunta_apto";
        return sock.sendMessage(grupoId, { text: "🏠 Qual o número do apartamento?" });
    }
    if (sessoesEncomenda[jid]?.etapa === "pergunta_apto") {
        const dados = sessoesEncomenda[jid];
        await axios.post(URL, { action: "registrar", dataPrevista: dados.dataPrevista, loja: dados.loja, apto: texto, usuario: jid });
        delete sessoesEncomenda[jid];
        return sock.sendMessage(grupoId, { text: "✅ Previsão anotada nos logs! Avisaremos quando chegar." });
    }

    // --- OPÇÃO 2: CONSULTAR ESPERADAS ---
    if (texto === "2") {
        const res = await axios.post(URL, { action: "consultar" });
        const lista = res.data.lista.map(r => `• ${r[2]} (Apto ${r[3]}) - Previsto: ${r[1]}`).join("\n");
        return sock.sendMessage(grupoId, { text: lista || "Nenhuma encomenda pendente." });
    }

    // --- OPÇÃO 3: CHEGOU / RECEBER ---
    if (texto === "3") {
        const res = await axios.post(URL, { action: "consultar" });
        if (res.data.lista.length === 0) return sock.sendMessage(grupoId, { text: "Nada para receber." });
        let msgLista = "📦 *CONFIRMAR CHEGADA*\nDigite o ID correspondente:\n\n";
        res.data.lista.forEach(r => msgLista += `🆔 *${r[0]}*\n🛍️ ${r[2]} (Apto ${r[3]})\n\n`);
        sessoesEncomenda[jid] = { etapa: "pergunta_id" };
        return sock.sendMessage(grupoId, { text: msgLista });
    }
    if (sessoesEncomenda[jid]?.etapa === "pergunta_id") {
        sessoesEncomenda[jid].idEscolhido = texto;
        sessoesEncomenda[jid].etapa = "pergunta_quem_recebeu";
        return sock.sendMessage(grupoId, { text: "👤 Quem está a receber esta encomenda na portaria agora?" });
    }
    if (sessoesEncomenda[jid]?.etapa === "pergunta_quem_recebeu") {
        const res = await axios.post(URL, { action: "receber", id: sessoesEncomenda[jid].idEscolhido, quemRecebeu: texto, dataChegada: new Date().toLocaleString("pt-BR") });
        const dono = res.data.dono;
        delete sessoesEncomenda[jid];
        return sock.sendMessage(grupoId, { text: `🔔 @${dono.split("@")[0]}, a sua encomenda chegou! Recebida por: *${texto}*`, mentions: [dono] });
    }

    // --- OPÇÃO 4: HISTÓRICO ---
    if (texto === "4") {
        const res = await axios.post(URL, { action: "historico" });
        if (res.data.lista.length === 0) return sock.sendMessage(grupoId, { text: "📜 O histórico está vazio." });
        
        let msgHist = "📜 *ÚLTIMAS ENTREGAS REALIZADAS:*\n\n";
        res.data.lista.slice(-10).forEach(r => { // Mostra as últimas 10
            msgHist += `✅ *Apto ${r[3]}* (${r[2]})\n👤 Recebido por: ${r[7]}\n📅 em: ${r[6]}\n\n`;
        });
        return sock.sendMessage(grupoId, { text: msgHist });
    }
}
