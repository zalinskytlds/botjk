import 'dotenv/config'; 
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import express from "express";
import QRCode from "qrcode";
import pino from "pino"; 
import { tratarMensagemLavanderia, configurarEventosGrupo as eventosLavanderia } from "./lavanderia.js"; 
import { tratarMensagemEncomendas, configurarEventosEncomendas } from "./encomendas.js";
import { registrarMensagemGrupo, registrarRespostaBot } from "./logger.js"; // 👈 Importa as duas funções do logger

const app = express();
app.use(express.json()); 

const PORT = process.env.PORT || 10000;
let ultimoQR = null;
let statusConexao = "Iniciando...";
let sock;

const obterGrupos = (envVar) => new Set(process.env[envVar]?.split(",").map(id => id.trim()).filter(id => id) || []);

// 💬 Função auxiliar para o index enviar mensagem e já salvar no logger da planilha
async function enviarMensagemComLog(grupoId, payload) {
    const resultado = await sock.sendMessage(grupoId, payload);
    if (payload && payload.text) {
        registrarRespostaBot(grupoId, payload.text); // Salva a resposta do bot na planilha
    }
    return resultado;
}

app.get("/", async (req, res) => {
    if (statusConexao === "Conectado") return res.send("<h1>✅ JK Online!</h1>");
    if (!ultimoQR) return res.send("<h1>⏳ Gerando QR...</h1><script>setTimeout(()=>location.reload(),5000)</script>");
    const qrImage = await QRCode.toDataURL(ultimoQR);
    res.send(`<h1>🔗 Conectar WhatsApp JK</h1><img src="${qrImage}" width="300"/><script>setTimeout(()=>location.reload(),20000)</script>`);
});

app.post("/aviso-lavanderia", async (req, res) => {
    const { jid, grupo, mensagem } = req.body;
    if (!sock) return res.status(500).send("Bot deslogado");
    try {
        if (jid && jid !== "admin") {
            await enviarMensagemComLog(grupo, { 
                text: `@${jid.split('@')[0]} ${mensagem}`, 
                mentions: [jid] 
            });
        } else {
            await enviarMensagemComLog(grupo, { text: mensagem });
        }
        res.status(200).send("OK");
    } catch (err) {
        console.error("❌ Erro ao enviar aviso automático:", err);
        res.status(500).send("Erro");
    }
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

    eventosLavanderia(sock);
    configurarEventosEncomendas(sock);

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

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignora mensagens do próprio bot aqui para não duplicar eventos duplicados do baileys
        
        const jid = msg.key.remoteJid;
        if (!jid || jid.includes('@lid')) return;

        const nomeMorador = msg.pushName || "Morador Desconhecido";
        const listaLavanderia = obterGrupos("GRUPOS_LAVANDERIA");
        const listaEncomendas = obterGrupos("GRUPOS_ENCOMENDAS");

        // 💬 1. Registra a mensagem enviada pelo morador na planilha
        if (listaLavanderia.has(jid)) {
            registrarMensagemGrupo(msg, nomeMorador);
        }

        const textoChat = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
        if (!textoChat) return;

        console.log(`📩 [MENSAGEM RECEBIDA] De: ${jid} | Texto: "${textoChat}"`);

        try {
            if (textoChat === "teste") {
                return await enviarMensagemComLog(jid, { text: "Teste realizado com sucesso! 😎" });
            }

            if (listaLavanderia.has(jid)) {
                console.log("🧺 [LAVANDERIA] Encaminhando mensagem para o módulo...");
                // Nota: O lavanderia.js usa sock.sendMessage direto. Se quiser que as respostas
                // geradas pelo lavanderia.js também vão para a planilha por aqui, 
                // podemos passá-las ou mantê-las independentes.
                await tratarMensagemLavanderia(sock, msg, jid);
            } else if (listaEncomendas.has(jid)) {
                console.log("📦 [ENCOMENDAS] Encaminhando mensagem para o módulo...");
                await tratarMensagemEncomendas(sock, msg, jid);
            }
        } catch (err) { 
            console.error("❌ Erro no processamento da mensagem:", err); 
        }
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor na porta ${PORT}`);
    conectarWhatsApp();
});
