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

/* ===============================
   🧠 ADAPTER (sock fake)
================================ */
const sock = {
  async sendMessage(to, content) {
    console.log("📤 Enviando mensagem para:", to);

    try {
      // texto simples
      if (typeof content === "string") {
        return axios.post(
          `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          { number: to, text: content },
          { headers: { apikey: EVOLUTION_API_KEY } }
        );
      }

      // texto normal
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

      // lista interativa
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
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem:", err.response?.data || err.message);
    }
  },
};

/* ===============================
   🧪 ROTA TESTE
================================ */
app.get("/", (req, res) => {
  res.send("BOT ONLINE");
});

app.get("/webhook", (req, res) => {
  res.send("WEBHOOK OK");
});

/* ===============================
   🌐 WEBHOOK EVOLUTION
================================ */
app.post("/webhook", async (req, res) => {
  console.log("📩 WEBHOOK RECEBIDO");

  try {
    const payload = req.body;

    // debug
    console.log(JSON.stringify(payload, null, 2));

    const data = payload?.data;

    if (!data?.key?.remoteJid) {
      return res.sendStatus(200);
    }

    const jid = data.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    console.log("📨 Mensagem de:", jid);

    if (isGroup) {
      await tratarMensagemLavanderia(sock, data, jid);
    } else {
      await tratarMensagemEncomendas(sock, data);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("❌ Erro no webhook:", e);
    res.sendStatus(200);
  }
});

/* ===============================
   🚀 START SERVER
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Bot rodando na porta", PORT);
});
