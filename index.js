// ===============================
// index.js - Bot JK (versão melhorada)
// ===============================
import express from "express";
import axios from "axios";
import { tratarMensagemLavanderia } from "./lavanderia.js";
import { tratarMensagemEncomendas } from "./encomendas.js";

const app = express();
app.use(express.json());

// ===============================
// 🔌 EVOLUTION CONFIG
// ===============================
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_URL || !EVOLUTION_INSTANCE || !EVOLUTION_API_KEY) {
  console.warn("⚠️ Variáveis da Evolution não configuradas!");
}

// ===============================
// 🧠 ADAPTER SEND MESSAGE
// ===============================
const sock = {
  async sendMessage(to, content) {
    try {
      console.log("📤 Enviando mensagem para:", to, "Conteúdo:", content);

      if (typeof content === "string" || content?.text) {
        return axios.post(
          `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
          { number: to, text: typeof content === "string" ? content : content.text },
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
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem:", err.response?.data || err.message);
    }
  },
};

// ===============================
// 🧪 ROTAS DE TESTE
// ===============================
app.get("/", (req, res) => res.send("🤖 BOT ONLINE"));
app.get("/webhook", (req, res) => res.send("WEBHOOK OK"));

// ===============================
// 🌐 WEBHOOK EVOLUTION
// ===============================
app.post("/webhook/:event?", async (req, res) => {
  try {
    const payload = req.body;
    const event = (req.params.event || payload?.event || "").replace(/-/g, ".");
    console.log("\n📩 Evento recebido:", event);

    switch (event) {
      case "messages.upsert":
        await handleMessage(payload);
        break;
      case "chats.update":
        console.log("📝 chats.update:", payload?.data);
        break;
      case "contacts.update":
        console.log("📝 contacts.update:", payload?.data);
        break;
      default:
        console.log("⏭️ Evento ignorado:", event);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro webhook:", err);
    res.sendStatus(200);
  }
});

// ===============================
// 🔹 HANDLER UNIFICADO DE MENSAGENS
// ===============================
const gruposLavanderia = new Set([
  "120363416759586760@g.us",
  "5551993321922-1558822702@g.us",
  "7838499872908@lid",
]);

const gruposEncomendas = new Set([
  "12036248264829284@g.us",
  "5551993321922-1432213403@g.us",
]);

async function handleMessage(payload) {
  try {
    const data = payload?.data?.messages?.[0] || payload?.data?.message || payload?.data;
    if (!data?.key?.remoteJid || data.key.fromMe) return;

    const jid = data.key.remoteJid;
    const texto = (data.message?.conversation || "").trim().toLowerCase();

    console.log("📨 Mensagem de:", jid, "| Texto:", texto);

    // Resposta automática a menu
    if (["menu", "!ajuda"].includes(texto)) {
      if (gruposLavanderia.has(jid)) {
        console.log("🧺 Enviando menu Lavanderia...");
        await tratarMensagemLavanderia(sock, data, jid);
        return;
      }
      if (gruposEncomendas.has(jid)) {
        console.log("📦 Enviando menu Encomendas...");
        await tratarMensagemEncomendas(sock, data);
        return;
      }
    }

    // Redireciona mensagem para o módulo correto
    if (gruposLavanderia.has(jid)) {
      await tratarMensagemLavanderia(sock, data, jid);
    } else if (gruposEncomendas.has(jid)) {
      await tratarMensagemEncomendas(sock, data);
    } else {
      console.log("⚠️ Grupo ou contato não configurado:", jid);
    }

    console.log("✅ Mensagem processada com sucesso");
  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err);
  }
}

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Bot rodando na porta ${PORT}`));
