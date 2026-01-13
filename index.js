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
// 🔐 CONFIGURAÇÕES WEB
// ===============================
const WEB_PASSWORD = "jk123"; // 🔒 senha da tela
const ARQ_WEB = "web.json";

// ===============================
// 🔧 VARIÁVEIS GLOBAIS
// ===============================
let sock;
let qrCodeAtual = null;
let codigoPareamento = null;
let reconectando = false;

let usarPareamentoPorNumero = false;
let numeroPareamento = "";

let webState = {
  autenticado: false,
  ultimoNumero: "",
};

let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

// ===============================
// 🧱 PERSISTÊNCIA WEB
// ===============================
if (fs.existsSync(ARQ_WEB)) {
  webState = JSON.parse(fs.readFileSync(ARQ_WEB, "utf-8"));
  numeroPareamento = webState.ultimoNumero || "";
}

function salvarWeb() {
  fs.writeFileSync(ARQ_WEB, JSON.stringify(webState, null, 2));
}

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

  // 🔐 CÓDIGO NUMÉRICO
  if (
    usarPareamentoPorNumero &&
    numeroPareamento &&
    !state.creds.registered
  ) {
    try {
      const codigo = await sock.requestPairingCode(numeroPareamento);
      codigoPareamento = codigo;
      console.log("🔐 Código:", codigo);
    } catch (e) {
      console.error("❌ Erro pareamento:", e.message);
    }
  }

  // 📩 MENSAGENS
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const jid = msg?.key?.remoteJid;

    if (!msg?.message || msg.key.fromMe || !jid?.endsWith("@g.us")) return;

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

  // 🔌 CONEXÃO
  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) qrCodeAtual = await QRCode.toDataURL(qr);

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
// 🌐 EXPRESS – TELA WEB
// ===============================
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  if (!webState.autenticado) {
    return res.send(`
    <html><body style="background:#020617;color:white;text-align:center">
    <h2>🔐 Login</h2>
    <form method="POST" action="/login">
    <input name="senha" type="password" placeholder="Senha" />
    <button>Entrar</button>
    </form>
    </body></html>
    `);
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:sans-serif;background:#0f172a;color:#fff;text-align:center}
.card{margin:20px auto;padding:20px;background:#020617;max-width:360px;border-radius:12px}
img{width:100%}
.code{font-size:26px;letter-spacing:6px;margin:10px}
input,button{padding:12px;width:100%;border-radius:8px;margin-top:8px}
</style>
</head>
<body>
<div class="card">
<h2>WhatsApp Web</h2>

<form method="POST" action="/numero">
<input name="numero" value="${numeroPareamento}" placeholder="Ex: 5511999999999" />
<button>Gerar código</button>
</form>

${qrCodeAtual ? `<img src="${qrCodeAtual}" />` : ""}

${codigoPareamento ? `<div class="code">${codigoPareamento}</div>` : ""}

<form method="POST" action="/novo">
<button>🔁 Gerar novo código</button>
</form>

<form method="POST" action="/toggle">
<button>🔄 Alternar método</button>
</form>

<form method="POST" action="/logout">
<button>🚪 Sair</button>
</form>

</div>
</body>
</html>
`);
});

app.post("/login", (req, res) => {
  if (req.body.senha === WEB_PASSWORD) {
    webState.autenticado = true;
    salvarWeb();
  }
  res.redirect("/");
});

app.post("/logout", (req, res) => {
  webState.autenticado = false;
  salvarWeb();
  res.redirect("/");
});

app.post("/numero", (req, res) => {
  numeroPareamento = req.body.numero.replace(/\D/g, "");
  webState.ultimoNumero = numeroPareamento;
  salvarWeb();
  usarPareamentoPorNumero = true;
  iniciar();
  res.redirect("/");
});

app.post("/novo", (req, res) => {
  qrCodeAtual = null;
  codigoPareamento = null;
  iniciar();
  res.redirect("/");
});

app.post("/toggle", (req, res) => {
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
