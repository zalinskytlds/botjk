import axios from "axios";
import moment from "moment-timezone";

// LINK DO GOOGLE APPS SCRIPT (Substitua pela sua URL de execução)
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbxWWCtw1_ApknZ45Goj3vHKQZCQMTdqrqCVX-tdcYJgr695OuJ2oR-a6b5LWKqgR2MMIQ/exec"; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

const DOIS_HORAS = 120 * 60 * 1000;
const DEZ_MINUTOS = 10 * 60 * 1000;

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";
    const agora = Date.now();

    try {
        // 1. BUSCAR DADOS (O Script do Google deve retornar um JSON com a lista de registros)
        const { data } = await axios.get(URL_GOOGLE_SCRIPT);
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        // --- AVISO AUTOMÁTICO DE 10 MINUTOS ---
        if (registroAtivo) {
            const fim = parseInt(registroAtivo.fim_previsto);
            if (registroAtivo.aviso_enviado !== "SIM" && (fim - agora) <= DEZ_MINUTOS) {
                await sock.sendMessage(grupoId, { 
                    text: `⚠️ @${registroAtivo.usuario.split("@")[0]}, sua lavagem termina em 10 min!`,
                    mentions: [registroAtivo.usuario]
                });
                // Envia comando para marcar aviso como enviado
                await axios.post(URL_GOOGLE_SCRIPT, { action: "marcarAviso", id: registroAtivo.ID });
            }
        }

        switch (texto) {
            case "menu":
            case "oi":
            case "!ajuda":
                const menu = `🧺 *LAVANDERIA JK UNIVERSITÁRIO*\n\n1️⃣ Dicas de uso 🧼\n2️⃣ Info Lavadora ⚙️\n3️⃣ Iniciar Lavagem 🚿\n4️⃣ Finalizar Lavagem ✅\n5️⃣ Entrar na Fila ⏳\n6️⃣ Sair da Fila 🚶‍♂️\n7️⃣ Sortear Roupas 🎲\n8️⃣ Horário ⏰\n9️⃣ Previsão do Tempo 🌦️\n🔟 Coleta de Lixo 🗑️\n\n👉 _Digite o número da opção._`;
                return sock.sendMessage(grupoId, { text: menu });

            case "1":
                return sock.sendMessage(grupoId, { text: "🧼 *Dica:* Verifique os bolsos! Moedas podem travar a bomba de drenagem da máquina." });

            case "2":
                return sock.sendMessage(grupoId, { text: "⚙️ *Info:* Máquina de lavar 8,5kg. Ciclo normal dura cerca de 60 minutos." });

            case "3": // INICIAR
                if (registroAtivo) return sock.sendMessage(grupoId, { text: `⛔ Máquina ocupada por @${registroAtivo.usuario.split("@")[0]}`, mentions: [registroAtivo.usuario] });
                const fimP = agora + DOIS_HORAS;
                await axios.post(URL_GOOGLE_SCRIPT, { 
                    action: "iniciar",
                    id: Date.now(),
                    usuario: remetente,
                    status: "em_uso",
                    inicio: agora,
                    fim_previsto: fimP
                });
                return sock.sendMessage(grupoId, { text: `🚿 Lavagem iniciada! Término: *${moment(fimP).tz(TIMEZONE).format("HH:mm")}*` });

            case "4": // FINALIZAR
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "A máquina já está livre! ✅" });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID });
                let avisoFila = filaEspera.length > 0 ? `\n\n📢 @${filaEspera[0].usuario.split("@")[0]}, a máquina liberou!` : "";
                return sock.sendMessage(grupoId, { text: `✅ Lavagem encerrada!${avisoFila}`, mentions: filaEspera[0] ? [filaEspera[0].usuario] : [] });

            case "5": // ENTRAR NA FILA
                if (filaEspera.some(f => f.usuario === remetente)) return sock.sendMessage(grupoId, { text: "⏳ Você já está na fila!" });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "entrarFila", usuario: remetente, id: Date.now() });
                return sock.sendMessage(grupoId, { text: "⏳ Você entrou na fila de espera!" });

            case "6": // SAIR DA FILA
                await axios.post(URL_GOOGLE_SCRIPT, { action: "sairFila", usuario: remetente });
                return sock.sendMessage(grupoId, { text: "🚶‍♂️ Você saiu da fila." });

            case "7": // SORTEAR
                const peso = (Math.random() * (8.0 - 1.0) + 1.0).toFixed(2);
                return sock.sendMessage(grupoId, { text: `🎲 *Sorteio:* Sua carga estimada é de *${peso}kg*.` });

            case "8":
                return sock.sendMessage(grupoId, { text: "⏰ *Horário:* Aberto das 07h às 23h." });

            case "9": // PREVISÃO DO TEMPO (HG Brasil)
                try {
                    const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                    const w = resClima.data.results;
                    return sock.sendMessage(grupoId, { text: `🌦️ *Clima em ${w.city}*\n🌡️ ${w.temp}°C - ${w.description}\n💧 Humidade: ${w.humidity}%` });
                } catch (e) { return sock.sendMessage(grupoId, { text: "❌ Erro ao consultar clima." }); }

            case "10":
                return sock.sendMessage(grupoId, { text: "🗑️ *Lixo:* Coleta Seg, Qua e Sex (Noite)." });

            case "+10":
            case "+30": // ESTENDER TEMPO
                if (registroAtivo && remetente === registroAtivo.usuario) {
                    const add = parseInt(texto.replace("+", "")) * 60000;
                    const novoFim = parseInt(registroAtivo.fim_previsto) + add;
                    await axios.post(URL_GOOGLE_SCRIPT, { action: "estender", id: registroAtivo.ID, novoFim: novoFim });
                    return sock.sendMessage(grupoId, { text: `✅ Estendido até ${moment(novoFim).tz(TIMEZONE).format("HH:mm")}` });
                }
                break;
        }
    } catch (err) { console.log("Erro no módulo:", err.message); }
}
