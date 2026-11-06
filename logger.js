import axios from "axios";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA;
const GRUPOS_LAVANDERIA = process.env.GRUPOS_LAVANDERIA?.split(",").map(id => id.trim()) || [];

/**
 * Registra apenas as mensagens trocadas nos grupos oficiais da lavanderia na planilha.
 */
export async function registrarMensagemGrupo(msg, nomeMorador) {
    try {
        if (!URL_GOOGLE_SCRIPT) return;

        const jid = msg.key?.remoteJid || "";

        // 🛡️ Filtra para garantir que só registra mensagens dos grupos da lavanderia informados
        if (!GRUPOS_LAVANDERIA.includes(jid)) return;

        const textoMensagem = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        // Se a mensagem não contiver texto (ex: figurinhas ou áudios puros), ignora
        if (!textoMensagem) return;

        const remetente = msg.key?.participant || msg.key?.remoteJid || "";

        // Envia de forma assíncrona para a planilha sem travar a execução do bot
        axios.post(URL_GOOGLE_SCRIPT, {
            action: "log_mensagem",
            usuario: remetente,
            nome: nomeMorador || "Morador Desconhecido",
            mensagem: textoMensagem
        }).catch(err => {
            console.error("❌ Erro ao enviar registro de mensagem para a planilha:", err.message);
        });

    } catch (e) {
        console.error("❌ Falha interna no módulo de logger:", e.message);
    }
}
