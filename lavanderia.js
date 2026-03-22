import axios from "axios";
import moment from "moment-timezone";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";

    try {
        const response = await axios.get(URL_GOOGLE_SCRIPT);
        const data = Array.isArray(response.data) ? response.data : [];
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        switch (texto) {
            case "menu": case "oi": case "11":
                const menu = `🧺 *LAVANDERIA JK*\n\n1️⃣ Dicas 🧼\n2️⃣ Info ⚙️\n3️⃣ Iniciar 🚿\n4️⃣ Finalizar ✅\n5️⃣ Fila ⏳\n6️⃣ Sair Fila 🚶‍♂️\n7️⃣ Sorteio 🎲\n8️⃣ Horário ⏰\n9️⃣ Clima 🌦️\n🔟 Lixo 🗑️`;
                return sock.sendMessage(grupoId, { text: menu });

            case "3": // Iniciar
                if (registroAtivo) return sock.sendMessage(grupoId, { text: `⛔ Ocupada por @${registroAtivo.usuario.split("@")[0]}\nTermina: *${registroAtivo.fim_previsto}*`, mentions: [registroAtivo.usuario] });
                const resIni = await axios.post(URL_GOOGLE_SCRIPT, { action: "iniciar", usuario: remetente });
                return sock.sendMessage(grupoId, { text: `🚿 *Iniciada!*\n🆔 ID: ${resIni.data.id}\n⏰ Fim: *${resIni.data.fim}*` });

            case "4": // Finalizar
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "Máquina livre! ✅" });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID });
                let avisoFila = filaEspera.length > 0 ? `\n\n📢 @${filaEspera[0].usuario.split("@")[0]}, sua vez!` : "";
                return sock.sendMessage(grupoId, { text: `✅ Encerrada!${avisoFila}`, mentions: filaEspera[0] ? [filaEspera[0].usuario] : [] });

            case "9": // Clima
                const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                const w = resClima.data.results;
                return sock.sendMessage(grupoId, { text: `🌦️ *Viamão:* ${w.temp}°C - ${w.description}` });

            case "10": // Lixo
                const hoje = moment().tz(TIMEZONE).day();
                const aviso = [2,4,6].includes(hoje) ? "\n\n🚨 *HOJE TEM COLETA!*" : "";
                return sock.sendMessage(grupoId, { text: `🗑️ *Coleta:* Ter, Qui e Sab (após 17h).${aviso}` });

            case "!resetar_lavanderia":
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar_tudo" });
                return sock.sendMessage(grupoId, { text: "⚠️ *ADMIN:* Sistema Resetado!" });
        }
    } catch (err) { console.log("❌ Erro:", err.message); }
}

// ROTA PARA O EXPRESS (Adicione no seu server.js/index.js)
// app.post("/aviso-lavanderia", async (req, res) => { ... código enviado anteriormente ... });
