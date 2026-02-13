import express from "express";
import axios from "axios";
import { tratarMensagemLavanderia } from "./lavanderia.js";
import { tratarMensagemEncomendas } from "./encomendas.js";

const app = express();
app.use(express.json());

/* ===============================
   🔌 EVOLUTION CONFIG
================================ */
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_URL || !EVOLUTION_INSTANCE || !EVOLUTION_API_KEY) {
  console.warn("⚠️ Variáveis de ambiente da Evolution não configuradas!");
}

/* ===============================
   🧠 ADAPTER (sock fake)
================================ */
const sock = {
  async sendMessage(to, content) {
    console.log("📤 Enviando mensagem para:", to);

    try {
      if (typeof content === "string") {
        return axios.post(
          `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          { number: to, text: content },
          { headers: { apikey: EVOLUTION_API_KEY } }
        );
      }

      if (content?.text && !content?.sections) {
        return axios.post(
          `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          {
            number: to,
            text: content.text,
            mentions: content.mentions || [],
          },
          { headers: { apikey: EVOLUTION_API_KEY } }
        );
      }

      if (content?.sections) {
        return axios.post(
          `${EVOLUTION_URL}/message/sendList/${EVOLUTION_INSTANCE}`,
          {
            number: to,
            text: content.text,
            footer: content.footer,
            buttonText: content.buttonText,
            sections: content.sections,
          },
          { headers: { apikey: EVOLUTION_API_KEY } }
        );
      }

      console.warn("⚠️ Tipo de mensagem não reconhecido:", content);
    } catch (err) {
      console.error(
        "❌ Erro ao enviar mensagem:",
        err.response?.data || err.message
      );
    }
  },
};

/* ===============================
   🧪 ROTAS DE TESTE
================================ */
app.get("/", (req, res) => {
  res.send("🤖 BOT ONLINE");
});

app.get("/webhook", (req, res) => {
  res.send("WEBHOOK OK");
});

/* ===============================
   🌐 WEBHOOK EVOLUTION (V2 FIX)
================================ */
app.post("/webhook", async (req, res) => {
  console.log("📩 WEBHOOK RECEBIDO");

  try {
    const payload = req.body;

    console.log("📦 EVENTO:", payload?.event);

    // 🔥 CORREÇÃO PARA EVOLUTION V2
    const data = payload?.data?.messages?.[0];

    if (!data?.key?.remoteJid) {
      return res.sendStatus(200);
    }

    // 🔥 IGNORA MENSAGENS DO PRÓPRIO BOT
    if (data.key.fromMe) {
      console.log("↩️ Ignorando mensagem enviada pelo próprio bot");
      return res.sendStatus(200);
    }

    const jid = data.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    console.log("📨 Mensagem de:", jid);
    console.log("📄 Conteúdo:", JSON.stringify(data.message, null, 2));

    if (isGroup) {
      await tratarMensagemLavanderia(sock, data, jid);
    } else {
      await tratarMensagemEncomendas(sock, data);
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("❌ Erro no webhook:", e);
    return res.sendStatus(200);
  }
});

/* ===============================
   🚀 START SERVER
================================ */
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot rodando na porta ${PORT}`);
});
