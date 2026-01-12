// ===============================
// 📦 IMPORTS (ESM)
// ===============================
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import P from "pino";
import fs from "fs";
import express from "express";
import axios from "axios";
import QRCode from "qrcode";

// ⚠️ módulos antigos (CommonJS)
const { tratarMensagemLavanderia } = require("./lavanderia-old.js");
const { tratarMensagemEncomendas } = require("./encomendas-old.js");

// ===============================
// 🔐 CONFIGURAÇÃO DE AUTENTICAÇÃO
// ===============================

// 👉 true = pareamento por número
// 👉 false = QR Code
const USAR_PAREAMENTO_POR_NUMERO = true;

// ⚠️ número no formato internacional SEM "+"
const NUMERO_WHATSAPP_BOT = "19842623829";

// ===============================
// 🔧 VARIÁVEIS GLOBAIS
// ===============================
let sock;
let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";
let reconectando = false;
let qrCodeAtual = null;

// ===============================
// 🧱 CARREGA GRUPOS
// ===============================
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:", grupos);
} else {
  console.log("⚠️ grupos.json não encontrado, será criado.");
  fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
}

// ===============================
// 🚀 FUNÇÃO PRINCIPAL
// ===============================
async function iniciar() {
  console.log("🔄 Iniciando bot WhatsApp...");

  if (sock?.ev) {
    try {
      sock.ev.removeAllListeners();
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !USAR_PAREAMENTO_POR_NUMERO,
    logger: P({ level: "silent" }),
    browser: ["BotJK", "Chrome", "120.0.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  // ===============================
  // 🔐 PAREAMENTO POR NÚMERO
  // ===============================
  if (USAR_PAREAMENTO_POR_NUMERO && !state.creds.registered) {
    try {
      const codigo = await sock.requestPairingCode(NUMERO_WHATSAPP_BOT);
      console.log("🔐 Código de pareamento:");
      console.log("👉", codigo);
      console.log("📱 WhatsApp > Aparelhos conectados > Conectar com número");
    } catch (err) {
      console.error("❌ Erro ao gerar código:", err.message);
    }
  }

  // ===============================
  // 📩 LISTENER DE MENSAGENS
  // ===============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const jid = msg?.key?.remoteJid;

    if (
      !msg?.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage ||
      !jid?.endsWith("@g.us")
    ) {
      return;
    }

    // ===============================
    // 🧠 IDENTIFICA GRUPOS
    // ===============================
    try {
      const metadata = await sock.groupMetadata(jid);
      const nomeGrupo = metadata.subject.toLowerCase();

      if (
        nomeGrupo.includes("lavanderia") &&
        !grupos.lavanderia.includes(jid)
      ) {
        grupos.lavanderia.push(jid);
      }

      if (
        (nomeGrupo.includes("jk") || nomeGrupo.includes("encomenda")) &&
        !grupos.encomendas.includes(jid)
      ) {
        grupos.encomendas.push(jid);
      }

      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch (err) {
      console.log("⚠️ Erro ao ler metadata:", err.message);
    }

    // ===============================
    // 🧺 LAVANDERIA
    // ===============================
    if (grupos.lavanderia.includes(jid)) {
      await tratarMensagemLavanderia(sock, msg, jid);
      return;
    }

    // ===============================
    // 📦 ENCOMENDAS
    // ===============================
    if (grupos.encomendas.includes(jid)) {
      await tratarMensagemEncomendas(sock, msg, jid);
      return;
    }
  });

  // ===============================
  // 🔌 STATUS DA CONEXÃO
  // ===============================
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeAtual = await QRCode.toDataURL(qr);
      console.log("📱 QR disponível em /qr");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (!reconectando && code !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Reconectando em 15s...");
        setTimeout(iniciar, 15000);
      } else {
        qrCodeAtual = null;
      }
    }

    if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado com sucesso!");
    }
  });
}

// ===============================
// ▶️ START
// ===============================
iniciar();

// ===============================
// 🌐 EXPRESS (RENDER)
// ===============================
const app = express();

app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp JK ativo.");
});

app.get("/qr", (req, res) => {
  if (!qrCodeAtual) return res.send("✅ Bot conectado.");
  res.send(`<img src="${qrCodeAtual}" />`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 HTTP rodando na porta ${PORT}`)
);

// ===============================
// ♻️ KEEP ALIVE (Render)
// ===============================
setInterval(async () => {
  try {
    const url = process.env.RENDER_EXTERNAL_URL
      ? `https://${process.env.RENDER_EXTERNAL_URL}`
      : `http://localhost:${PORT}`;

    await axios.get(url);
  } catch {}
}, 1000 * 60 * 5);
