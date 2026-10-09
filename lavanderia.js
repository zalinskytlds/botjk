import axios from "axios";
import moment from "moment-timezone";
import { GoogleGenAI } from "@google/genai";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

// Inicializa o Gemini buscando a chave do ambiente configurada no Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SISTEMA_BASE_JK = `Você é o assistente virtual inteligente e amigável da lavanderia da Pousada JK em Viamão/RS. 
Diretrizes e regras que você DEVE respeitar e transmitir:
- Capacidade máxima da Electrolux: 8,5kg (cerca de 48 peças leves).
- Proibido estritamente usar sabão em pó (causa corrosão e queima o motor). Apenas sabão líquido até a marca MAX.
- Horário de funcionamento: Das 07:00 às 22:00 (último início às 20:00).
- Tempo limite por uso: 2 horas (120 minutos).
- Proibido lavar na máquina: Tênis, edredons de casal/queen, tapetes de borracha e travesseiros de espuma.
- Mantenha um tom prestativo, comunitário, educado e use emojis de forma moderada.`;

const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

// Função auxiliar para chamar o Gemini com suporte à SDK nova e logs detalhados
async function gerarRespostaGemini(promptUsuario) {
    try {
        console.log("🤖 [GEMINI] A iniciar chamada para o modelo...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptUsuario,
            config: {
                systemInstruction: SISTEMA_BASE_JK,
                maxOutputTokens: 350,
            }
        });
        
        console.log("🤖 [GEMINI] Resposta bruta recebida com sucesso!");

        if (response && response.text) {
            return response.text.trim();
        }
        
        if (response && response.candidates?.[0]?.content?.parts?.[0]?.text) {
            return response.candidates[0].content.parts[0].text.trim();
        }

        return null;
    } catch (error) {
        console.error("❌ [GEMINI] Erro crítico na API:", error.message || error);
        return null;
    }
}

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";
    const nomeMorador = msg.pushName || "Morador Desconhecido";

    try {
        const response = await axios.get(URL_GOOGLE_SCRIPT);
        const data = Array.isArray(response.data) ? response.data : [];
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        switch (texto) {
            case "menu": 
            case "oi": 
            case "11": {
                const saudacao = obterSaudacao();
                const menu = `👋 ${saudacao}!\n\n🧺 *LAVANDERIA JK*\n\n1️⃣ Dicas de uso 🧼\n2️⃣ Info da maquina ⚙️\n3️⃣ Iniciar Lavagem 🚿\n4️⃣ Finalizar Lavagem ✅\n5️⃣ Entrar na Fila ⏳\n6️⃣ Sair da Fila 🚶‍♂️\n7️⃣ Calcular peso das roupas 🎲\n8️⃣ Horário de funcionamento ⏰\n9️⃣ Previsão do tempo 🌦️\n🔟 Coleta de Lixo 🗑️`;
                return sock.sendMessage(grupoId, { text: menu });
            }

            case "1": {
                const prompt = "Gere 4 dicas criativas e essenciais de preservação e uso para moradores que usam uma máquina de lavar coletiva (ex: cuidar com bolsos, avesso, quantidade de sabão líquido, deixar tampa aberta). Formate com emojis e tópicos claros.";
                let dicas = await gerarRespostaGemini(prompt);
                if (!dicas) dicas = "🧼 *Dica:* Verifique sempre os bolsos e use apenas sabão líquido!";
                return sock.sendMessage(grupoId, { text: `💡 *DICAS DE USO INTELIGENTES - JK*\n\n${dicas}\n\n_Preserve o que é de todos!_ 🤝` });
            }

            case "2": {
                const promptInfo = "Explique de forma organizada as especificações técnicas da lavanderia: máquina Electrolux de 8,5kg, limite estrito de 2 horas de uso por morador, proibição absoluta de sabão em pó (apenas líquido até a marca MAX), e alerta sobre danos ao motor.";
                let info = await gerarRespostaGemini(promptInfo);
                if (!info) info = "⚙️ *Especificações:* Electrolux 8,5kg. Proibido sabão em pó. Limite de 2 horas.";
                return sock.sendMessage(grupoId, { text: `⚙️ *ESPECIFICAÇÕES E REGRAS*\n\n${info}\n\n*Respeite o tempo do próximo morador!* 🤝` });
            }

            case "3": {
                if (registroAtivo) {
                    return sock.sendMessage(grupoId, { 
                        text: `⛔ *LAVANDERIA OCUPADA*\n\nUsuário: @${registroAtivo.usuario.split("@")[0]}\nPrevisão de término: *${registroAtivo.fim_previsto}*`, 
                        mentions: [registroAtivo.usuario] 
                    });
                }
                const agoraSP = moment().tz(TIMEZONE);
                if (agoraSP.hour() < 7 || agoraSP.hour() >= 20) {
                    return sock.sendMessage(grupoId, { text: `⚠️ *FORA DO HORÁRIO DE USO*\n\nA lavanderia funciona das *07:00 às 22:00*.\n\nÚltimo horário de início: *20:00*. Respeite o silêncio após as 22:00! 🤫` });
                }

                let dicaClimaIA = "Lavagem iniciada com sucesso!";
                try {
                    const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                    const w = resClima.data.results;
                    const promptClima = `O clima atual em Viamão é: ${w.description}, Temperatura: ${w.temp}°C, Umidade: ${w.humidity}%. Escreva uma frase curta e prática (máximo 2 linhas) dando uma dica de secagem no varal baseada nisso.`;
                    dicaClimaIA = await gerarRespostaGemini(promptClima) || "🌤️ Fique atento ao tempo para estender suas roupas!";
                } catch (e) {
                    dicaClimaIA = "🌤️ Monitore o tempo ao estender suas roupas no varal!";
                }

                const resIni = await axios.post(URL_GOOGLE_SCRIPT, { action: "iniciar", usuario: remetente, nome: nomeMorador });
                const horaFimStr = resIni.data.fim;

                const msgSucesso = `🚿 *LAVAGEM INICIADA COM SUCESSO!*\n\n` +
                    `👤 *Morador:* ${nomeMorador}\n` +
                    `⏰ *Início:* ${agoraSP.format("HH:mm")} | 🏁 *Fim Previsto:* ${horaFimStr}\n\n` +
                    `🌦️ *Dica do Clima (Gemini):* ${dicaClimaIA}\n\n` +
                    `🚫 *ALERTAS IMPORTANTES:*\n` +
                    `1️⃣ **SABÃO LÍQUIDO APENAS** (O pó danifica o motor).\n` +
                    `2️⃣ **LIMITE DE 2 HORAS** para evitar retenção da máquina.\n\n` +
                    `_Você receberá um aviso antes do término!_ 🤝`;

                return sock.sendMessage(grupoId, { text: msgSucesso, mentions: [remetente] });
            }

            case "4": {
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "✅ A máquina já está livre e disponível para uso!" });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID, usuario: remetente });
                
                let textoFim = `✅ *LAVAGEM ENCERRADA!* \n\nA máquina da JK Universitário foi liberada por @${remetente.split("@")[0]}.`;
                let mencoesFim = [remetente];
                
                if (filaEspera.length > 0) {
                    const proximo = filaEspera[0].usuario;
                    textoFim += `\n\n📢 *SUA VEZ:* @${proximo.split("@")[0]}, a máquina está livre! Você tem 10 minutos para iniciar sua lavagem.`;
                    mencoesFim.push(proximo);
                } else {
                    textoFim += `\n\n✨ *MÁQUINA DISPONÍVEL:* Não há ninguém na fila no momento.`;
                }
                textoFim += `\n\n🧼 *Lembrete:* Deixe a tampa aberta para evitar mofo!`;
                return sock.sendMessage(grupoId, { text: textoFim, mentions: mencoesFim });
            }

            case "5": {
                if (filaEspera.some(f => f.usuario === remetente)) {
                    return sock.sendMessage(grupoId, { text: `⏳ @${remetente.split("@")[0]}, você já consta na fila de espera! Aguarde sua vez.`, mentions: [remetente] });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "entrarFila", usuario: remetente, nome: nomeMorador });
                const posicao = filaEspera.length + 1;
                
                let msgFila = `⏳ *FILA DE ESPERA - JK UNIVERSITÁRIO*\n\n✅ *${nomeMorador}*, sua solicitação foi registrada!\n📍 Sua posição atual: *${posicao}º lugar*\n\n`;
                msgFila += (posicao === 1) ? `🚀 Você é o próximo! Assim que a máquina for liberada, você será avisado.` : `📱 Fique atento ao grupo, o bot avisará quando chegar sua vez.`;
                return sock.sendMessage(grupoId, { text: msgFila, mentions: [remetente] });
            }

            case "6": {
                await axios.post(URL_GOOGLE_SCRIPT, { action: "sairFila", usuario: remetente });
                return sock.sendMessage(grupoId, { text: `🚶‍♂️ *DESISTÊNCIA REGISTRADA*\n\n@${remetente.split("@")[0]} saiu da fila de espera.`, mentions: [remetente] });
            }

            case "7": {
                const promptPeso = "Monte uma sugestão criativa de combinação de roupas (pesando no total cerca de 7.5kg a 8kg) para ajudar um morador a entender o limite seguro de carga da máquina de lavar.";
                let comboIA = await gerarRespostaGemini(promptPeso);
                if (!comboIA) comboIA = "👖 *Combo Sugerido:* 4 calças jeans + 10 camisetas + peças leves (Total ~8kg).";
                
                return sock.sendMessage(grupoId, { text: `🧺 *GUIA DE USO CONSCIENTE (Gemini)*\n\nPara preservar o equipamento, o limite é **8kg**.\n\n${comboIA}\n\n❌ *PROIBIDO:* Tênis, Edredons Casal/Queen e Tapetes.` });
            }

            case "8": {
                return sock.sendMessage(grupoId, { text: `🏢 *NORMAS DE USO DA LAVANDERIA JK*\n\n⏰ 07:00h às 22:00h (Último início: 20:00h).\n🚫 *EXCLUSIVIDADE:* Proibido lavar roupas de terceiros.\n🌱 Use com consciência!` });
            }

            case "9": {
                try {
                    const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                    const w = resClima.data.results;
                    const promptClimaReport = `Com base nestes dados de Viamão: Clima ${w.description}, Temperatura ${w.temp}°C, Umidade ${w.humidity}%, crie um panorama divertido e útil para quem está pensando em lavar e secar roupa hoje.`;
                    const relatorioClima = await gerarRespostaGemini(promptClimaReport) || `🌡️ *Temp:* ${w.temp}°C\n💧 *Umidade:* ${w.humidity}%`;
                    
                    return sock.sendMessage(grupoId, { text: `🌡️ *CONDIÇÕES DO TEMPO EM VIAMÃO*\n\n${relatorioClima}\n\n_Consulte o clima antes de iniciar um ciclo longo!_ 🤝` });
                } catch (err) {
                    return sock.sendMessage(grupoId, { text: "⚠️ Não foi possível carregar a previsão do tempo no momento." });
                }
            }

            case "10": {
                const hojeDia = moment().tz(TIMEZONE).day(); 
                const avisoLixo = [2,4,6].includes(hojeDia) ? "\n\n🚨 *HOJE TEM COLETA!*" : "";
                return sock.sendMessage(grupoId, { text: `🗑️ *Coleta de Lixo:* Ter, Qui e Sab (após 17h).${avisoLixo}` });
            }

            default: {
                const respostaLivre = await gerarRespostaGemini(`O morador ${nomeMorador} disse: "${texto}". Responda à dúvida dele relacionada à lavanderia ou regras da Pousada JK.`);
                if (respostaLivre) {
                    return sock.sendMessage(grupoId, { text: respostaLivre });
                }
                break;
            }
        }
    } catch (err) { 
        console.log("❌ Erro geral no módulo:", err.message); 
    }
}

export function configurarEventosGrupo(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        for (const participante of num.participants) {
            const nomeParticipante = (await sock.getName(participante)) || participante.split('@')[0];
            const saudacao = obterSaudacao();
            if (num.action === 'add') {
                await sock.sendMessage(idGrupo, { text: `👋 ${saudacao}! Seja bem-vindo(a) à **JK Universitário** *${nomeParticipante}*!\n\nSou o assistente da nossa lavanderia. Digite *Menu* para conhecer as regras. 🧺`, mentions: [participante] });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "log_evento", usuario: participante, nome: nomeParticipante, evento: "entrou" }).catch(()=>{});
            }
        }
    });
}