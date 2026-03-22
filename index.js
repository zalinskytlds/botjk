import axios from "axios";
import moment from "moment-timezone";

const URL_GOOGLE_ENCOMENDAS = process.env.URL_GOOGLE_ENCOMENDAS; 
const TIMEZONE = "America/Sao_Paulo";

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const textoRaw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const texto = textoRaw.toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";

    try {
        // --- 1. DETECTAR SE O USUÁRIO DIGITOU UM ID (Ex: "ID 1" ou "id 1") ---
        if (texto.startsWith("id ")) {
            const idInformado = texto.replace("id ", "").trim();
            
            if (isNaN(idInformado)) {
                return sock.sendMessage(grupoId, { text: "❌ Por favor, digite um número de ID válido. Ex: *ID 1*" });
            }

            // Envia para o Google Script a confirmação de chegada
            const res = await axios.post(URL_GOOGLE_ENCOMENDAS, { 
                action: "dar_baixa", 
                id: idInformado,
                usuario_confirmou: remetente 
            });

            if (res.data.status === "success") {
                return sock.sendMessage(grupoId, { text: `✅ Encomenda *ID ${idInformado}* confirmada com sucesso! Ela foi movida para o histórico.` });
            } else {
                return sock.sendMessage(grupoId, { text: `⚠️ Não encontrei nenhuma encomenda com o ID ${idInformado}.` });
            }
        }

        // --- 2. MENU PRINCIPAL (SWITCH DE NÚMEROS) ---
        switch (texto) {
            case "menu":
            case "oi":
                const menu = `📦 *ENCOMENDAS JK*\n\n1️⃣ Registrar previsão\n2️⃣ Consultar esperadas\n3️⃣ Confirmar chegada (Baixa)\n4️⃣ Ver Histórico\n\n👉 _Digite o número da opção._`;
                return sock.sendMessage(grupoId, { text: menu });

            case "1":
                return sock.sendMessage(grupoId, { text: "📝 Para registrar, digite os dados no formato:\n*NOVA [Loja] [Data]*\n\nEx: _NOVA Amazon 25/03_" });

            case "2": // Consultar Esperadas
                const resEsperadas = await axios.get(URL_GOOGLE_ENCOMENDAS + "?status=esperada");
                // Aqui você monta a lista vinda da planilha
                return sock.sendMessage(grupoId, { text: "🔍 *ENCOMENDAS ESPERADAS:*\n\n" + resEsperadas.data.lista });

            case "3": // Confirmar Chegada
                const resListaBaixa = await axios.get(URL_GOOGLE_ENCOMENDAS + "?status=esperada");
                const listaConfirmar = `📦 *CONFIRMAR CHEGADA*\n\nPara dar baixa, digite *ID* + o número:\n\n${resListaBaixa.data.lista_formatada || "Nenhuma encomenda pendente."}`;
                return sock.sendMessage(grupoId, { text: listaConfirmar });

            case "4": // Histórico
                return sock.sendMessage(grupoId, { text: "📅 O histórico dos últimos 30 dias pode ser consultado no link da planilha oficial do JK." });
        }

        // --- 3. TRATAR CRIAÇÃO DE NOVA ENCOMENDA (Ex: "NOVA Amazon 25/03") ---
        if (texto.startsWith("nova ")) {
            const partes = textoRaw.split(" ");
            const loja = partes[1] || "Não informada";
            const dataPrevista = partes[2] || "A confirmar";

            await axios.post(URL_GOOGLE_ENCOMENDAS, {
                action: "registrar",
                loja: loja,
                data: dataPrevista,
                usuario: remetente
            });

            return sock.sendMessage(grupoId, { text: `📝 *Registrado!* Esperamos sua encomenda da *${loja}* para o dia ${dataPrevista}.` });
        }

    } catch (err) {
        console.log("❌ Erro Encomendas:", err.message);
    }
}
