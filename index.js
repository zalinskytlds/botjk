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
   Compatível com Baileys
================================ */
const sock = {
  async sendMessage(to, content) {
    // texto simples
    if (typeof content === "string") {
      return axios.post(
        `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        { number: to, text: content },
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

    // texto com mentions
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
  },
};

/* ===============================
   🌐 WEBHOOK EVOLUTION
================================ */
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const data = payload?.data;

    // ignora eventos que não são mensagem
    if (!data || !data.message || !data.key?.remoteJid) {
      return res.sendStatus(200);
    }

    const jid = data.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    // roteamento por tipo
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
  console.log("🚀 Bot Evolution ativo na porta", PORT);
});
