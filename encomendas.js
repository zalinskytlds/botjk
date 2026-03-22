import axios from "axios";

// Pega a URL das variáveis de ambiente
const URL = process.env.URL_GOOGLE_ENCOMENDAS;
let sessoesEncomenda = {}; 

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const jid = msg.key.participant || msg.key.remoteJid;
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const textoLow = texto.toLowerCase();

    // Se não houver URL configurada, avisa no log para você saber
    if (!URL) {
        console.error("ERRO: Variável URL_GOOGLE_ENCOMENDAS não definida!");
        return;
    }

    try {
        if (textoLow === "menu") {
            delete sessoesEncomenda[jid];
            const menu = `📦 *ENCOMENDAS JK*\n\n1️⃣ Registrar previsão\n2️⃣ Consultar esperadas\n3️⃣ Confirmar chegada (Baixa)\n4️⃣ Ver Histórico de Entregas`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- OPÇÃO 1: REGISTRAR ---
        if (texto === "1") {
            sessoesEncomenda[jid] = { etapa: "pergunta_data" };
            return sock.sendMessage(grupoId, { text: "📅 Qual a data prevista para a chegada? (Ex: 25/03)" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            sessoesEncomenda[jid].dataPrevista = texto;
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Mercado Livre, Shopee):" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = texto;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Qual o *nome do morador* destinatário?" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_nome") {
            const dados = sessoesEncomenda[jid];
            await axios.post(URL, { 
                action: "registrar", 
                dataPrevista: dados.dataPrevista, 
                loja: dados.loja, 
                apto: texto.toUpperCase(), 
                usuario: jid 
            });
            delete sessoesEncomenda[jid];
            return sock.sendMessage(grupoId, { text: `✅ Previsão para *${texto.toUpperCase()}* anotada! Avisaremos quando chegar.` });
        }

        // --- OPÇÃO 2: CONSULTAR ESPERADAS ---
        if (texto === "2") {
            const res = await axios.post(URL, { action: "consultar" });
            const lista = res.data.lista.map(r => `• ${r[2]} para *${r[3]}* - Previsto: ${r[1]}`).join("\n");
            return sock.sendMessage(grupoId, { text: lista || "📭 Nenhuma encomenda pendente." });
        }

        // --- OPÇÃO 3: CHEGOU / RECEBER ---
        if (texto === "3") {
            const res = await axios.post(URL, { action: "consultar" });
            if (!res.data.lista || res.data.lista.length === 0) return sock.sendMessage(grupoId, { text: "Nada para receber." });
            
            let msgLista = "📦 *CONFIRMAR CHEGADA*\nDigite o ID correspondente:\n\n";
            res.data.lista.forEach(r => msgLista += `🆔 *${r[0]}* - ${r[2]} (*${r[3]}*)\n`);
            sessoesEncomenda[jid] = { etapa: "pergunta_id" };
            return sock.sendMessage(grupoId, { text: msgLista });
        }

        // Lógica para processar o ID da Opção 3
        if (sessoesEncomenda[jid]?.etapa === "pergunta_id") {
            await axios.post(URL, { action: "receber", id: texto });
            delete sessoesEncomenda[jid];
            return sock.sendMessage(grupoId, { text: `✅ Encomenda ${texto} marcada como ENTREGUE!` });
        }

    } catch (error) {
        console.error("Erro na comunicação com a planilha:", error.message);
        return sock.sendMessage(grupoId, { text: "❌ Erro ao conectar com a planilha. Verifique a URL." });
    }
}
