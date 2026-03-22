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
const PORT = process.env.PORT || 3001;

let ultimoQR = null;
let statusConexao = "Aguardando inicialização...";

// IDs dos Grupos (Configurados no Render)
const gruposLavanderia = new Set(process.env.GRUPOS_LAVANDERIA?.split(",") || []);
const gruposEncomendas = new Set(process.env.GRUPOS_ENCOMENDAS?.split(",") || []);

// --- ROTA DA PÁGINA DE CONEXÃO ---
app.get("/conectar", async (req, res) => {
    if (statusConexao === "Conectado") {
        return res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1 style="color: green;">✅ WhatsApp Conectado!</h1>
                <p>O bot do JK Universitário está ativo e operante.</p>
            </div>
        `);
    }

    if (!ultimoQR) {
        return res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>⏳ Gerando QR Code...</h1>
                <p>Aguarde alguns segundos e atualize a página.</p>
                <script>setTimeout(() => { location.reload(); }, 5000);</script>
            </div>
        `);
    }

    try {
        const qrImage = await QRCode.toDataURL(ultimoQR);
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>🔗 Conectar WhatsApp - JK</h1>
                <p>Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho</p>
                <img src="${qrImage}" style="border: 15px solid white; box-shadow: 0 0 20px rgba(0,0,0,0.2); margin: 20px; width: 300px;" />
                <p>Status: <strong>${statusConexao}</strong></p>
                <script>setTimeout(() => { location.reload(); }, 25000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send("Erro ao gerar imagem do QR Code.");
    }
});

app.get("/", (req, res) => res.send("🤖 Bot JK Online. Acesse /conectar para o QR Code."));

// --- LÓGICA DO WHATSAPP ---
async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_jk");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }), 
        browser: ["JK Universitário", "Chrome", "1.0.0"]
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            ultimoQR = qr;
            statusConexao = "Aguardando leitura do QR Code...";
        }

        if (connection === "close") {
            ultimoQR = null;
            const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
            statusConexao = "Desconectado. Tentando reconectar...";
            
            if (motivo !== DisconnectReason.loggedOut) {
                conectarWhatsApp();
            } else {
                statusConexao = "Desconectado pelo usuário. Escaneie novamente.";
            }
        } else if (connection === "open") {
            ultimoQR = null;
            statusConexao = "Conectado";
            console.log("✅ Conexão aberta com sucesso!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const jid = msg.key.remoteJid;

        try {
            // Roteamento para Lavanderia
            if (gruposLavanderia.has(jid)) {
                console.log(`🧺 Processando Lavanderia no grupo: ${jid}`);
                await tratarMensagemLavanderia(sock, msg, jid);
            } 
            // Roteamento para Encomendas
            else if (gruposEncomendas.has(jid)) {
                console.log(`📦 Processando Encomendas no grupo: ${jid}`);
                await tratarMensagemEncomendas(sock, msg);
            }
        } catch (err) {
            console.error("❌ Erro no fluxo:", err.message);
        }
    });
}

// Inicia o servidor e o bot
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    conectarWhatsApp();
});
        
