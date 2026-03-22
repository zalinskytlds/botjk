import axios from "axios";
import moment from "moment-timezone";

const URL_SHEETDB = process.env.SHEETDB_LAVANDERIA;
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

const DOIS_HORAS = 120 * 60 * 1000;
const DEZ_MINUTOS = 10 * 60 * 1000;

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";
    const numeroStr = remetente.split("@")[0];
    const agora = Date.now();

    try {
        const { data } = await axios.get(URL_SHEETDB);
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        // --- AVISO AUTOMÁTICO DE 10 MINUTOS ---
        if (registroAtivo) {
            const fim = parseInt(registroAtivo.fim_previsto);
            if (registroAtivo.aviso_enviado !== "SIM" && (fim - agora) <= DEZ_MINUTOS) {
                await sock.sendMessage(grupoId, { 
                    text: `⚠️ @${registroAtivo.usuario.split("@")[0]}, sua lavagem termina em 10 min! Quer estender? Digite *+10* ou *+30*.`,
                    mentions: [registroAtivo.usuario]
                });
                await axios.patch(`${URL_SHEETDB}/ID/${registroAtivo.ID}`, { aviso_enviado: "SIM" });
            }
        }

        switch (texto) {
            case "menu":
            case "oi":
            case "!ajuda":
                const menu = `🧺 *LAVANDERIA JK UNIVERSITÁRIO*\n\n1️⃣ Dicas de uso 🧼\n2️⃣ Info Lavadora ⚙️\n3️⃣ Iniciar Lavagem 🚿\n4️⃣ Finalizar Lavagem ✅\n5️⃣ Entrar na Fila ⏳\n6️⃣ Sair da Fila 🚶‍♂️\n7️⃣ Sortear Roupas 🎲\n8️⃣ Horário ⏰\n9️⃣ Previsão do Tempo 🌦️\n🔟 Coleta de Lixo 🗑️\n\n👉 _Digite o número da opção._`;
                return sock.sendMessage(grupoId, { text: menu });

            case "1":
                return sock.sendMessage(grupoId, { text: "🧼 *Dicas:* Não misture panos de prato com roupas íntimas e use sabão na medida certa para não estragar a máquina." });

            case "2":
                return sock.sendMessage(grupoId, { text: "⚙️ *Info:* Electrolux 8,5kg. Ideal para cargas médias. Ciclo completo com centrifugação leva aprox. 60 min." });

            case "3": // INICIAR
                if (registroAtivo) return sock.sendMessage(grupoId, { text: `⛔ Ocupada por @${registroAtivo.usuario.split("@")[0]}. Termina às ${moment(parseInt(registroAtivo.fim_previsto)).tz(TIMEZONE).format("HH:mm")}`, mentions: [registroAtivo.usuario] });
                const fimP = agora + DOIS_HORAS;
                await axios.post(URL_SHEETDB, { ID: Date.now(), usuario: remetente, status: "em_uso", inicio: agora, fim_previsto: fimP, aviso_enviado: "NAO" });
                return sock.sendMessage(grupoId, { text: `🚿 Lavagem iniciada! Término previsto: *${moment(fimP).tz(TIMEZONE).format("HH:mm")}*` });

            case "4": // FINALIZAR
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "A máquina já está liberada! ✅" });
                await axios.patch(`${URL_SHEETDB}/ID/${registroAtivo.ID}`, { status: "finalizado" });
                let avisoFila = "";
                if (filaEspera.length > 0) {
                    avisoFila = `\n\n📢 @${filaEspera[0].usuario.split("@")[0]}, a máquina liberou! Sua vez.`;
                }
                return sock.sendMessage(grupoId, { text: `✅ Lavagem encerrada!${avisoFila}`, mentions: filaEspera[0] ? [filaEspera[0].usuario] : [] });

            case "5": // ENTRAR NA FILA
                if (filaEspera.some(f => f.usuario === remetente)) return sock.sendMessage(grupoId, { text: "⏳ Você já está na fila!" });
                await axios.post(URL_SHEETDB, { ID: Date.now(), usuario: remetente, status: "na_fila" });
                return sock.sendMessage(grupoId, { text: "⏳ Você entrou na fila de espera!" });

            case "6": // SAIR DA FILA
                const cadastro = filaEspera.find(f => f.usuario === remetente);
                if (cadastro) {
                    await axios.delete(`${URL_SHEETDB}/ID/${cadastro.ID}`);
                    return sock.sendMessage(grupoId, { text: "🚶‍♂️ Você saiu da fila." });
                }
                return sock.sendMessage(grupoId, { text: "Você não estava na fila." });

            case "7": // SORTEAR (Exemplo simplificado de peso)
                const pesoMax = 8.0;
                let pesoAtual = (Math.random() * (8.0 - 1.0) + 1.0).toFixed(2);
                return sock.sendMessage(grupoId, { text: `🎲 *Sorteio de Carga:* Sua lavagem de hoje deu aprox. *${pesoAtual}kg*. Está dentro do limite de ${pesoMax}kg! ✅` });

            case "8":
                return sock.sendMessage(grupoId, { text: "⏰ *Horário:* Lavanderia JK aberta das 07h às 23h. Evite barulho após as 22h!" });

            case "9": // PREVISÃO DO TEMPO (HG Brasil)
                try {
                    // Usando "Viamão" ou "Porto Alegre" conforme sua localização
                    const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                    const w = resClima.data.results;
                    const climaTxt = `🌦️ *Clima em ${w.city}*\n\n🌡️ Temp: ${w.temp}°C\n☁️ Céu: ${w.description}\n💧 Humidade: ${w.humidity}%\n💨 Vento: ${w.wind_speedy}\n\n👉 *Status:* ${w.description.includes("Chuva") ? "Melhor não colocar no varal externo! ⛈️" : "Bom para secar roupa! ☀️"}`;
                    return sock.sendMessage(grupoId, { text: climaTxt });
                } catch (e) {
                    return sock.sendMessage(grupoId, { text: "❌ API de clima fora do ar." });
                }

            case "10":
                return sock.sendMessage(grupoId, { text: "🗑️ *Coleta de Lixo:* Seg, Qua e Sex (Noite). Separe o lixo seco do orgânico!" });

            case "+10":
            case "+30":
                if (registroAtivo && remetente === registroAtivo.usuario) {
                    const add = parseInt(texto.replace("+", "")) * 60000;
                    const novoFim = parseInt(registroAtivo.fim_previsto) + add;
                    await axios.patch(`${URL_SHEETDB}/ID/${registroAtivo.ID}`, { fim_previsto: novoFim, aviso_enviado: "NAO" });
                    return sock.sendMessage(grupoId, { text: `✅ Tempo estendido até ${moment(novoFim).tz(TIMEZONE).format("HH:mm")}` });
                }
                break;
        }
    } catch (err) { console.log("Erro no módulo:", err.message); }
}
