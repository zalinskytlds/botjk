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
  console.warn("⚠️ Variáveis da Evolution não configuradas!");
}

/* ===============================
   🧠 ADAPTER SEND MESSAGE
================================ */
const sock = {
  async sendMessage(to, content) {
    try {
      if (typeof content === "string") {
        return axios.post(
          `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          { number: to, text: content },
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

      if (content?.text) {
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
    } catch (err) {
      console.error("❌ Erro ao enviar:", err.response?.data || err.message);
    }
  },
};

/* ===============================
   🧪 TESTE
================================ */
app.get("/", (req, res) => {
  res.send("🤖 BOT ONLINE");
});

app.get("/webhook", (req, res) => {
  res.send("WEBHOOK OK");
});

/* ===============================
   🌐 WEBHOOK EVOLUTION (FIX PRO)
================================ */
app.post("/webhook/:event?", async (req, res) => {
  console.log("\n📩 ===============================");
  console.log("📩 WEBHOOK RECEBIDO");

  try {
    const payload = req.body;

    // 🔥 normaliza evento (messages-upsert -> messages.upsert)
    const event = (req.params.event || payload?.event || "")
      .replace(/-/g, ".");

    console.log("📦 EVENTO:", event);

    // 🔥 ignora eventos inúteis
    if (event !== "messages.upsert") {
      console.log("⏭️ Evento ignorado:", event);
      return res.sendStatus(200);
    }

    // 🔥 compat Evolution v2
    const data =
      payload?.data?.messages?.[0] ||
      payload?.data?.message ||
      payload?.data;

    if (!data?.key?.remoteJid) {
      console.log("⚠️ sem remoteJid");
      return res.sendStatus(200);
    }

    if (data.key.fromMe) {
      console.log("↩️ Ignorando mensagem do próprio bot");
      return res.sendStatus(200);
    }

    const jid = data.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    console.log("📨 JID:", jid);
    console.log("📄 MESSAGE:", JSON.stringify(data.message));

    if (isGroup) {
      await tratarMensagemLavanderia(sock, data, jid);
    } else {
      await tratarMensagemEncomendas(sock, data);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Erro webhook:", err);
    return res.sendStatus(200);
  }
});

/* ===============================
   🚀 START
================================ */
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot rodando na porta ${PORT}`);
});
