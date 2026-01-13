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

// módulos do bot
import { tratarMensagemLavanderia } from "./lavanderia.js";
import { tratarMensagemEncomendas } from "./encomendas.js";

// ===============================
// 🔐 CONFIG
// ===============================

// pode alternar pela web
let usarPareamentoPorNumero = false;

// número SEM "+"
const NUMERO_WHATSAPP_BOT = "19842623829";

// ===============================
// 🔧 VARIÁVEIS GLOBAIS
// ===============================
let sock;
let qrCodeAtual = null;
let codigoPareamento = null;
let reconectando = false;

let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

// ===============================
// 🧱 CARREGA GRUPOS
// ===============================
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:", grupos);
} else {
  fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
}

// ===============================
// 🚀 INICIAR BOT
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
    printQRInTerminal: !usarPareamentoPorNumero,
    logger: P({ level: "silent" }),
    browser: ["BotJK", "Chrome", "120.0.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  // ===============================
  // 🔐 CÓDIGO NUMÉRICO
  // ===============================
  if (usarPareamentoPorNumero && !state.creds.registered) {
    try {
      const codigo = await sock.requestPairingCode(NUMERO_WHATSAPP_BOT);
      codigoPareamento = codigo;
      console.log("🔐 Código de pareamento:", codigo);
    } catch (e) {
      console.error("❌ Erro pareamento:", e.message);
    }
  }

  // ===============================
  // 📩 MENSAGENS
  // ===============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const jid = msg?.key?.remoteJid;

    if (
      !msg?.message ||
      msg.key.fromMe ||
      !jid?.endsWith("@g.us")
    )
      return;

    try {
      const meta = await sock.groupMetadata(jid);
      const nome = meta.subject.toLowerCase();

      if (nome.includes("lavanderia") && !grupos.lavanderia.includes(jid))
        grupos.lavanderia.push(jid);

      if (
        (nome.includes("jk") || nome.includes("encomenda")) &&
        !grupos.encomendas.includes(jid)
      )
        grupos.encomendas.push(jid);

      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch {}

    if (grupos.lavanderia.includes(jid))
      return tratarMensagemLavanderia(sock, msg, jid);

    if (grupos.encomendas.includes(jid))
      return tratarMensagemEncomendas(sock, msg, jid);
  });

  // ===============================
  // 🔌 CONEXÃO
  // ===============================
  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      qrCodeAtual = await QRCode.toDataURL(qr);
    }

    if (connection === "open") {
      console.log("✅ Bot conectado!");
      qrCodeAtual = null;
      codigoPareamento = null;
      reconectando = false;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (!reconectando && code !== DisconnectReason.loggedOut) {
        reconectando = true;
        setTimeout(iniciar, 15000);
      }
    }
  });
}

iniciar();

// ===============================
// 🌐 EXPRESS (TELA WHATSAPP WEB)
// ===============================
const app = express();

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Bot JK - WhatsApp</title>
<style>
body{font-family:sans-serif;background:#0f172a;color:#fff;text-align:center}
.card{margin:40px auto;padding:30px;background:#020617;width:340px;border-radius:12px}
img{width:260px}
.code{font-size:28px;letter-spacing:6px;margin:20px}
button{padding:10px 20px;border:none;border-radius:8px;cursor:pointer}
</style>
</head>
<body>
<div class="card">
<h2>WhatsApp Web</h2>

${
  qrCodeAtual
    ? `<img src="${qrCodeAtual}" />`
    : "<p>QR indisponível</p>"
}

${
  codigoPareamento
    ? `<div class="code">${codigoPareamento}</div>`
    : "<p>Código indisponível</p>"
}

<form action="/toggle" method="post">
<button>Alternar método</button>
</form>

<p>WhatsApp → Aparelhos conectados</p>
</div>
</body>
</html>
`);
});

app.post("/toggle", express.urlencoded({ extended: true }), (req, res) => {
  usarPareamentoPorNumero = !usarPareamentoPorNumero;
  qrCodeAtual = null;
  codigoPareamento = null;
  iniciar();
  res.redirect("/");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log("🌐 Web ativa na porta", PORT)
);

// ===============================
// ♻️ KEEP ALIVE
// ===============================
setInterval(async () => {
  try {
    const url = process.env.RENDER_EXTERNAL_URL
      ? `https://${process.env.RENDER_EXTERNAL_URL}`
      : `http://localhost:${PORT}`;
    await axios.get(url);
  } catch {}
}, 1000 * 60 * 5);
