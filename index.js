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
      console.log("📤 Enviando mensagem para:", to, "Conteúdo:", content);

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
      console.error("❌ Erro ao enviar mensagem:", err.response?.data || err.message);
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
   🌐 WEBHOOK EVOLUTION REFACTORED
================================ */
app.post("/webhook/:event?", async (req, res) => {
  console.log("\n📩 ===============================");
  console.log("📩 WEBHOOK RECEBIDO");

  try {
    const payload = req.body;
    const event = (req.params.event || payload?.event || "").replace(/-/g, ".");
    console.log("📦 EVENTO:", event);

    switch (event) {
      case "messages.upsert":
        await handleMessage(payload);
        break;

      case "chats.update":
        console.log("📝 Evento chats.update recebido:", payload?.data);
        break;

      case "contacts.update":
        console.log("📝 Evento contacts.update recebido:", payload?.data);
        break;

      default:
        console.log("⏭️ Evento ignorado:", event);
        break;
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Erro webhook:", err);
    return res.sendStatus(200);
  }
});

/* ===============================
   🔹 HANDLER DE MENSAGENS
================================ */
async function handleMessage(payload) {
  try {
    const data =
      payload?.data?.messages?.[0] ||
      payload?.data?.message ||
      payload?.data;

    if (!data?.key?.remoteJid) {
      console.log("⚠️ Sem remoteJid");
      return;
    }

    if (data.key.fromMe) {
      console.log("↩️ Ignorando mensagem do próprio bot");
      return;
    }

    const jid = data.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const msgContent = data.message || {};

    console.log("📨 JID:", jid);
    console.log("📄 MESSAGE:", JSON.stringify(msgContent));

    // 🔹 Roteamento por grupo
    const lavanderiaGroups = [
      "120363416759586760@g.us",
      "5551993321922-1558822702@g.us"
    ];

    const entregasGroups = [
      "12036248264829284@g.us",
      "5551993321922-1432213403@g.us"
    ];

    if (isGroup) {
      console.log("🧺 Processando mensagem de grupo...");

      if (lavanderiaGroups.includes(jid)) {
        await tratarMensagemLavanderia(sock, data, jid);
      } else if (entregasGroups.includes(jid)) {
        await tratarMensagemEncomendas(sock, data, jid);
      } else {
        console.log("⚠️ Grupo não configurado para respostas automáticas:", jid);
      }

    } else {
      console.log("📦 Processando mensagem individual...");
      await tratarMensagemEncomendas(sock, data, jid);
    }

    console.log("✅ Mensagem processada com sucesso");

  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err);
  }
}

/* ===============================
   🚀 START
================================ */
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot rodando na porta ${PORT}`);
});
