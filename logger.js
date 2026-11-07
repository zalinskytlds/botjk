import axios from "axios";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA;
const GRUPOS_LAVANDERIA = process.env.GRUPOS_LAVANDERIA?.split(",").map(id => id.trim()) || [];

/**
 * Registra mensagens enviadas pelos moradores nos grupos oficiais.
 */
export async function registrarMensagemGrupo(msg, nomeMorador) {
    try {
        if (!URL_GOOGLE_SCRIPT) return;

        const jid = msg.key?.remoteJid || "";
        if (!GRUPOS_LAVANDERIA.includes(jid)) return;

        const textoMensagem = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!textoMensagem) return;

        const remetente = msg.key?.participant || msg.key?.remoteJid || "";

        axios.post(URL_GOOGLE_SCRIPT, {
            action: "log_mensagem",
            usuario: remetente,
            nome: nomeMorador || "Morador Desconhecido",
            mensagem: textoMensagem
        }).catch(err => {
            console.error("❌ Erro ao enviar mensagem do morador para a planilha:", err.message);
        });

    } catch (e) {
        console.error("❌ Falha interna no logger (morador):", e.message);
    }
}

/**
 * Registra as respostas enviadas pelo próprio Bot na planilha.
 */
export async function registrarRespostaBot(grupoId, textoMensagem) {
    try {
        if (!URL_GOOGLE_SCRIPT || !textoMensagem) return;
        if (!GRUPOS_LAVANDERIA.includes(grupoId)) return;

        axios.post(URL_GOOGLE_SCRIPT, {
            action: "log_mensagem",
            usuario: "Bot_JK",
            nome: "Assistente Lavanderia",
            mensagem: textoMensagem
        }).catch(err => {
            console.error("❌ Erro ao enviar resposta do bot para a planilha:", err.message);
        });

    } catch (e) {
        console.error("❌ Falha interna no logger (bot):", e.message);
    }
}
