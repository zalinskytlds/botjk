import 'dotenv/config'; 
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
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
let sock;

// Lógica para transformar a string do Render em uma lista (Set) de IDs
const obterGrupos = (envVar) => new Set(process.env[envVar]?.split(",").map(id => id.trim()).filter(id => id) || []);

app.get("/", async (req, res) => {
    if (statusConexao === "Conectado") return res.send("<h1>✅ JK Online!</h1>");
    if (!ultimoQR) return res.send("<h1>⏳ Gerando QR...</h1><script>setTimeout(()=>location.reload(),5000)</script>");
    const qrImage = await QRCode.toDataURL(ultimoQR);
    res.send(`<h1>🔗 Conectar WhatsApp JK</h1><img src="${qrImage}" width="300"/><script>setTimeout(()=>location.reload(),20000)</script>`);
});

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_jk");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "error" }),
        browser: ["JK Universitário", "Chrome", "1.0.0"],
        markOnlineOnConnect: true
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) ultimoQR = qr;
        if (connection === "close") {
            const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) conectarWhatsApp();
        } else if (connection === "open") {
            ultimoQR = null; statusConexao = "Conectado";
            console.log("✅✅ WHATSAPP CONECTADO!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const jid = msg.key.remoteJid;
        const textoChat = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();

        // Listas atualizadas a cada mensagem (para pegar mudanças no Render sem reiniciar se possível)
        const listaLavanderia = obterGrupos("GRUPOS_LAVANDERIA");
        const listaEncomendas = obterGrupos("GRUPOS_ENCOMENDAS");

        try {
            if (textoChat === "teste") return await sock.sendMessage(jid, { text: "Teste realizado com sucesso! 😎" });

            if (listaLavanderia.has(jid)) {
                await tratarMensagemLavanderia(sock, msg, jid);
            } else if (listaEncomendas.has(jid)) {
                await tratarMensagemEncomendas(sock, msg, jid);
            } else {
                console.log(`⚠️ JID não autorizado: ${jid}`);
            }
        } catch (err) { console.error("❌ Erro:", err); }
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor na porta ${PORT}`);
    conectarWhatsApp();
});
