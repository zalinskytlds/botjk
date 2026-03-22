import axios from "axios";

const URL = process.env.URL_GOOGLE_ENCOMENDAS;
let sessoesEncomenda = {}; 

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const jid = msg.key.participant || msg.key.remoteJid;
    const textoRaw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const textoLow = textoRaw.toLowerCase();

    if (!URL) return console.error("ERRO: URL_GOOGLE_ENCOMENDAS não definida!");

    try {
        // --- 1. COMANDO DE BAIXA DIRETA (Ex: "ID 1", "id 500") ---
        // Isso roda ANTES de qualquer outra lógica para não confundir com o menu
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
                    text: `✅ Encomenda *ID ${idBuscado}* CHEGOU!\n\n🔔 @${donoJid.split("@")[0]}, sua encomenda está disponível na portaria!`,
                    mentions: [donoJid]
                });
            } else {
                return sock.sendMessage(grupoId, { text: `❌ ID *${idBuscado}* não encontrado ou já entregue.` });
            }
        }

        // --- 2. MENU E VOLTAR ---
        if (textoLow === "menu" || textoLow === "sair") {
            delete sessoesEncomenda[jid];
            const menu = `📦 *ENCOMENDAS JK*\n\n1️⃣ Registrar previsão\n2️⃣ Consultar esperadas\n3️⃣ Confirmar chegada (Baixa)\n4️⃣ Ver Histórico\n\n👉 _Digite o número ou use "ID [número]"_`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- 3. LÓGICA DE REGISTRO (ETAPAS) ---
        // Só entra aqui se houver uma sessão ativa para o usuário
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            sessoesEncomenda[jid].dataPrevista = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Amazon, Shopee):" });
        }
        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Qual o *nome do morador* destinatário?" });
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

        // --- 4. OPÇÕES DO MENU (SWITCH) ---
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
        console.error("Erro:", error.message);
        return sock.sendMessage(grupoId, { text: "❌ Erro na comunicação com o sistema." });
    }
}
