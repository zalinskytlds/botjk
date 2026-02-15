import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ===============================
// CONFIG EVOLUTION
// ===============================
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_URL || !EVOLUTION_INSTANCE || !EVOLUTION_API_KEY) {
  console.warn("⚠️ Variáveis da Evolution não configuradas!");
}

// ===============================
// FUNÇÃO DE ENVIO
// ===============================
async function sendMessage(to, content) {
  try {
    return axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: to, text: content },
      { headers: { apikey: EVOLUTION_API_KEY } }
    );
  } catch (err) {
    console.error("❌ Erro ao enviar:", err.response?.data || err.message);
  }
}

// ===============================
// ROTA DE TESTE
// ===============================
app.get("/", (req, res) => res.send("🤖 Bot Teste Online"));

// ===============================
// WEBHOOK RECEBENDO MENSAGENS
// ===============================
app.post("/webhook/:event?", async (req, res) => {
  const payload = req.body;
  const event = (req.params.event || payload?.event || "").replace(/-/g, ".");
  
  console.log("\n===============================");
  console.log("📩 EVENTO RECEBIDO:", event);
  console.log("📦 PAYLOAD:", JSON.stringify(payload, null, 2));

  if (event === "messages.upsert") {
    const msg = payload?.data?.messages?.[0] || payload?.data?.message || payload?.data;

    if (!msg?.key?.remoteJid) {
      console.log("⚠️ Sem remoteJid");
      return res.sendStatus(200);
    }

    const jid = msg.key.remoteJid;
    const fromMe = msg.key.fromMe;

    if (fromMe) {
      console.log("↩️ Mensagem do próprio bot, ignorando.");
      return res.sendStatus(200);
    }

    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "⚡ Conteúdo não reconhecido";

    console.log(`📨 Mensagem de ${jid}:`, texto);

    // RESPOSTA AUTOMÁTICA
    await sendMessage(jid, `🤖 Teste OK! Recebi sua mensagem: "${texto}"`);
  }

  res.sendStatus(200);
});

// ===============================
// START
// ===============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot Teste rodando na porta ${PORT}`);
});
