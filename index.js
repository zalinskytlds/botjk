import 'dotenv/config'; 
import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import express from "express";
import QRCode from "qrcode";
import pino from "pino"; 
import { tratarMensagemLavanderia } from "./lavanderia.js";
import { tratarMensagemEncomendas } from "./encomendas.js";

const app = express();
const PORT = process.env.PORT || 10000;

let ultimoQR = null;
let statusConexao = "Iniciando...";
let sock; // Definir globalmente para facilitar

const gruposLavanderia = new Set(process.env.GRUPOS_LAVANDERIA?.split(",").map(id => id.trim()) || []);
const gruposEncomendas = new Set(process.env.GRUPOS_ENCOMENDAS?.split(",").map(id => id.trim()) || []);

app.get("/", async (req, res) => {
    if (statusConexao === "Conectado") return res.send("<h1>✅ Conectado!</h1>");
    if (!ultimoQR) return res.send("<h1>⏳ Gerando QR...</h1><script>setTimeout(()=>location.reload(),5000)</script>");
    const qrImage = await QRCode.toDataURL(ultimoQR);
    res.send(`<h1>🔗 Conectar JK</h1><img src="${qrImage}" width="300"/><script>setTimeout(()=>location.reload(),20000)</script>`);
});

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_jk");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "info" }), // Aumentei o nível para ver mais detalhes
        browser: ["JK Universitário", "Chrome", "1.0.0"],
        markOnlineOnConnect: true
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { 
            console.log("👉 NOVO QR DISPONÍVEL NA URL /");
            ultimoQR = qr; 
        }
        if (connection === "close") {
            const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log("❌ Conexão fechada. Motivo:", motivo);
            if (motivo !== DisconnectReason.loggedOut) conectarWhatsApp();
        } else if (connection === "open") {
            console.log("✅✅ WHATSAPP CONECTADO E PRONTO!");
            ultimoQR = null; 
            statusConexao = "Conectado";
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // OUVINTE DE MENSAGENS TURBINADO
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        console.log("📩 EVENTO UPSERT DISPARADO!"); // Se isso não aparecer, o bot não está ouvindo o Whats

        if (type !== "notify") return;
        const msg = messages[0];
        
        // Log básico para saber que algo chegou
        const jid = msg.key.remoteJid;
        console.log(`📍 Mensagem de: ${jid}`);

        if (!msg.message || msg.key.fromMe) return;

        const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").toLowerCase();
        console.log(`📝 Conteúdo: ${texto}`);

        try {
            // TESTE RÁPIDO: Se você digitar "teste", ele responde em qualquer lugar
            if (texto === "teste") {
                return await sock.sendMessage(jid, { text: "O pai tá on! 😎" });
            }

            if (gruposLavanderia.has(jid)) {
                console.log("🧺 Roteando para Lavanderia...");
                await tratarMensagemLavanderia(sock, msg, jid);
            } else if (gruposEncomendas.has(jid)) {
                console.log("📦 Roteando para Encomendas...");
                await tratarMensagemEncomendas(sock, msg);
            } else {
                console.log("⚠️ JID não autorizado nas variáveis de ambiente.");
            }
        } catch (err) {
            console.error("❌ Erro ao processar:", err);
        }
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor na porta ${PORT}`);
    conectarWhatsApp();
});
