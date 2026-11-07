import axios from "axios";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA;
const GRUPOS_LAVANDERIA = process.env.GRUPOS_LAVANDERIA?.split(",").map(id => id.trim()) || [];

/**
 * Registra tanto as mensagens dos moradores quanto as respostas do próprio bot nos grupos oficiais.
 */
export async function registrarMensagemGrupo(msg, nomeMorador) {
    try {
        if (!URL_GOOGLE_SCRIPT) return;

        const jid = msg.key?.remoteJid || "";
        if (!GRUPOS_LAVANDERIA.includes(jid)) return;

        const textoMensagem = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!textoMensagem) return;

        // Verifica se a mensagem foi enviada pelo próprio Bot (fromMe = true)
        const ehDoBot = msg.key?.fromMe;
        const usuario = ehDoBot ? "Bot_JK" : (msg.key?.participant || jid);
        const nome = ehDoBot ? "Assistente Lavanderia" : (nomeMorador || "Morador Desconhecido");

        // Envia para a planilha na aba "registro_conversas"
        axios.post(URL_GOOGLE_SCRIPT, {
            action: "log_mensagem",
            usuario: usuario,
            nome: nome,
            mensagem: textoMensagem
        }).catch(err => {
            console.error("❌ Erro ao enviar log para a planilha:", err.message);
        });

    } catch (e) {
        console.error("❌ Falha interna no módulo logger:", e.message);
    }
}
