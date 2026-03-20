// ==========================================
// index.js - BOT JK UNIVERSITÁRIO (SEGURO)
// ==========================================
import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import express from "express";
import { tratarMensagemLavanderia } from "./lavanderia.js";
import { tratarMensagemEncomendas } from "./encomendas.js";

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIGURAÇÃO DE PRIVACIDADE ---
// No Render, você vai criar as variáveis: GRUPOS_LAVANDERIA e GRUPOS_ENCOMENDAS
// separando os IDs por vírgula. Ex: ID1,ID2,ID3
const gruposLavanderia = new Set(process.env.GRUPOS_LAVANDERIA?.split(",") || []);
const gruposEncomendas = new Set(process.env.GRUPOS_ENCOMENDAS?.split(",") || []);

app.get("/", (req, res) => res.send("🤖 JK Universitário - Bot Online e Protegido"));

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_jk");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ["JK Universitário", "Chrome", "1.0.0"],
        syncFullHistory: false
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) {
                conectarWhatsApp();
            }
        } else if (connection === "open") {
            console.log("✅ Conectado! IDs dos grupos carregados via Ambiente.");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;

        try {
            // O bot agora checa se o ID que enviou a mensagem está na sua lista secreta
            if (gruposLavanderia.has(jid)) {
                await tratarMensagemLavanderia(sock, msg, jid);
            } else if (gruposEncomendas.has(jid)) {
                await tratarMensagemEncomendas(sock, msg);
            }
        } catch (err) {
            console.error("❌ Erro:", err.message);
        }
    });

    return sock;
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    conectarWhatsApp();
});
