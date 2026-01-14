// ===============================
// 📦 IMPORTS
// ===============================
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import P from "pino";
import fs from "fs";
import express from "express";
import QRCode from "qrcode";

// ===============================
// 🔧 ESTADO GLOBAL
// ===============================
let sock = null;
let qrCodeAtual = null;
let codigoPareamento = null;
let metodo = "qr"; // qr | codigo
let numeroPareamento = "";
let reconectando = false;

// ===============================
// 🚀 INICIAR SOCKET
// ===============================
async function iniciarSocket() {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.ws.close();
    } catch {}
    sock = null;
  }

  console.log("🔄 Iniciando socket:", metodo);

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: metodo === "qr",
    browser: ["BotJK", "Chrome", "120"],
  });

  sock.ev.on("creds.update", saveCreds);

  // 🔳 QR CODE
  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr && metodo === "qr") {
      qrCodeAtual = await QRCode.toDataURL(qr);
      console.log("📱 QR gerado");
    }

    if (connection === "open") {
      console.log("✅ Conectado!");
      qrCodeAtual = null;
      codigoPareamento = null;
      reconectando = false;
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Conexão fechada:", code);

      if (!reconectando && code !== DisconnectReason.loggedOut) {
        reconectando = true;
        setTimeout(iniciarSocket, 10000);
      }
    }
  });

  // 🔢 CÓDIGO NUMÉRICO
  if (metodo === "codigo" && numeroPareamento) {
    setTimeout(async () => {
      try {
        const codigo = await sock.requestPairingCode(numeroPareamento);
        codigoPareamento = codigo;
        console.log("🔐 Código:", codigo);
      } catch (e) {
        console.error("❌ Erro código:", e.message);
      }
    }, 2000);
  }
}

iniciarSocket();

// ===============================
// 🌐 EXPRESS WEB
// ===============================
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{background:#0f172a;color:white;font-family:sans-serif;text-align:center}
.card{background:#020617;padding:20px;border-radius:12px;max-width:360px;margin:20px auto}
img{width:100%}
.code{font-size:26px;letter-spacing:6px;margin:10px}
input,button{width:100%;padding:12px;margin-top:8px;border-radius:8px}
</style>
</head>
<body>
<div class="card">
<h2>WhatsApp Web</h2>

<form method="POST" action="/codigo">
<input name="numero" placeholder="5511999999999" />
<button>Conectar com número</button>
</form>

${metodo === "qr" && qrCodeAtual ? `<img src="${qrCodeAtual}" />` : ""}
${metodo === "codigo" && codigoPareamento ? `<div class="code">${codigoPareamento}</div>` : ""}

<form method="POST" action="/qr">
<button>Usar QR Code</button>
</form>
</div>
</body>
</html>
`);
});

app.post("/codigo", (req, res) => {
  numeroPareamento = req.body.numero.replace(/\D/g, "");
  metodo = "codigo";
  qrCodeAtual = null;
  codigoPareamento = null;
  iniciarSocket();
  res.redirect("/");
});

app.post("/qr", (req, res) => {
  metodo = "qr";
  qrCodeAtual = null;
  codigoPareamento = null;
  iniciarSocket();
  res.redirect("/");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("🌐 Web ativa na porta", PORT)
);
