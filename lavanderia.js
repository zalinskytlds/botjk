import axios from "axios";
import moment from "moment-timezone";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

// --- FUNÇÃO PARA SAUDAÇÃO DINÂMICA ---
const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
    const remetente = msg.key?.participant || msg.key?.remoteJid || "";
    
    // CAPTURA O NOME DO PERFIL DO USUÁRIO (O QUE APARECE NO WHATSAPP)
    const nomeMorador = msg.pushName || "Morador";

    try {
        // Busca o status atual da planilha
        const response = await axios.get(URL_GOOGLE_SCRIPT);
        const data = Array.isArray(response.data) ? response.data : [];
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        switch (texto) {
            case "menu": case "oi": case "11": case "ajuda":
                const saudacao = obterSaudacao();
                const menu = `👋 ${saudacao}!\n\n🧺 *LAVANDERIA JK*\n\n1️⃣ Dicas de uso 🧼\n2️⃣ Info da maquina ⚙️\n3️⃣ Iniciar Lavagem 🚿\n4️⃣ Finalizar Lavagem ✅\n5️⃣ Entrar na Fila ⏳\n6️⃣ Sair da Fila 🚶‍♂️\n7️⃣ Calcular peso das roupas 🎲\n8️⃣ Horário de funcionamento ⏰\n9️⃣ Previsão do tempo 🌦️\n🔟 Coleta de Lixo 🗑️`;
                return sock.sendMessage(grupoId, { text: menu });

            case "1": 
                const dicasLavanderia = [
                    "🧼 *Dica:* Verifique sempre os bolsos! Moedas, grampos e chaves podem travar a bomba.",
                    "👕 *Dica:* Lave roupas do avesso! Isso preserva a cor das peças.",
                    "🫧 *Dica:* Menos é mais! O excesso de sabão cria uma crosta que corrói a máquina.",
                    "📏 *Dica:* Regra do Palmo! Deixe um palmo de folga entre as roupas e o topo do cesto.",
                    "🧺 *Dica:* Use saquinhos protetores para roupas íntimas ou delicadas.",
                    "🧣 *Dica:* Nunca lave panos de chão junto com suas roupas pessoais."
                ];
                const dicaSorteada = dicasLavanderia[Math.floor(Math.random() * dicasLavanderia.length)];
                return sock.sendMessage(grupoId, { text: `💡 *DICA DO DIA*\n\n${dicaSorteada}` });

            case "2": 
                const infoLavadora = `⚙️ *ESPECIFICAÇÕES*\n\n*Equipamento:* Electrolux 8,5kg\n*Capacidade:* Até 8kg.\n\n⏳ *LIMITE: 2 HORAS POR MORADOR*\n\n🚫 *PROIBIDO SABÃO EM PÓ:* Use apenas **SABÃO LÍQUIDO**. O pó corrói o motor e o suporte do cesto.`;
                return sock.sendMessage(grupoId, { text: infoLavadora });

            case "3": 
                if (registroAtivo) {
                    return sock.sendMessage(grupoId, { 
                        text: `⛔ *LAVANDERIA OCUPADA*\n\nUsuário: @${registroAtivo.usuario.split("@")[0]}\nPrevisão de término: *${registroAtivo.fim_previsto}*`, 
                        mentions: [registroAtivo.usuario] 
                    });
                }
                
                const agoraSaoPaulo = moment().tz(TIMEZONE);
                const horaAtualCheck = agoraSaoPaulo.hour();

                if (horaAtualCheck < 7 || horaAtualCheck >= 20) {
                    return sock.sendMessage(grupoId, { 
                        text: `⚠️ *FORA DO HORÁRIO*\nA lavanderia funciona das *07:00 às 22:00*. Último início às 20:00.` 
                    });
                }

                // POST COM NOME E USUÁRIO CORRETOS
                const resIni = await axios.post(URL_GOOGLE_SCRIPT, { 
                    action: "iniciar", 
                    usuario: remetente, 
                    nome: nomeMorador 
                });

                const mensagemSucesso = `🚿 *LAVAGEM INICIADA!*\n\n👤 *Morador:* ${nomeMorador}\n⏰ *Início:* ${agoraSaoPaulo.format("HH:mm")}\n🏁 *Fim Previsto:* ${resIni.data.fim}\n\n_Use apenas sabão líquido!_ 🤝`;
                return sock.sendMessage(grupoId, { text: mensagemSucesso, mentions: [remetente] });

            case "4": 
                if (!registroAtivo) {
                    return sock.sendMessage(grupoId, { text: "✅ A máquina já está livre!" });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID, usuario: remetente });
                
                let textoFinalizar = `✅ *LAVAGEM ENCERRADA!* \n\nLiberada por @${remetente.split("@")[0]}.`;
                let mencoesFim = [remetente];
                
                if (filaEspera.length > 0) {
                    const proximo = filaEspera[0].usuario;
                    textoFinalizar += `\n\n📢 *SUA VEZ:* @${proximo.split("@")[0]}, a máquina está livre!`;
                    mencoesFim.push(proximo);
                }
                return sock.sendMessage(grupoId, { text: textoFinalizar, mentions: mencoesFim });

            case "5": 
                if (filaEspera.some(f => f.usuario === remetente)) {
                    return sock.sendMessage(grupoId, { text: `⏳ Você já está na fila!`, mentions: [remetente] });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { 
                    action: "entrarFila", 
                    usuario: remetente, 
                    nome: nomeMorador 
                });
                
                const posicao = filaEspera.length + 1;
                return sock.sendMessage(grupoId, { 
                    text: `⏳ *FILA REGISTRADA*\n\n✅ ${nomeMorador}, você está na posição: *${posicao}º*`,
                    mentions: [remetente] 
                });

            case "6": 
                const usuarioNaFila = filaEspera.find(f => f.usuario === remetente);
                if (!usuarioNaFila) {
                    return sock.sendMessage(grupoId, { text: "❌ Você não está na fila." });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "sairFila", usuario: remetente });
                return sock.sendMessage(grupoId, { text: `🚶‍♂️ @${remetente.split("@")[0]} saiu da fila.`, mentions: [remetente] });

            case "7": 
                const msgPeso = `🧺 *GUIA DE PESO (Máximo 8kg)*\n\n👖 5 Jeans + 10 Camisetas ≈ 7kg\n🛏️ 2 Jogos de Cama + Toalhas ≈ 7.5kg\n\n⚠️ *PROIBIDO:* Tênis, Edredons King e Tapetes de borracha.`;
                return sock.sendMessage(grupoId, { text: msgPeso });

            case "8": 
                const msgHorario = `🏢 *REGRAS JK*\n\n⏰ 07:00 às 22:00\n🚫 Proibido lavar roupas de terceiros.\n🧼 Use apenas sabão líquido.`;
                return sock.sendMessage(grupoId, { text: msgHorario });

            case "9": 
                const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                const w = resClima.data.results;
                return sock.sendMessage(grupoId, { 
                    text: `🌡️ *CLIMA EM VIAMÃO*\n\n🌡️ ${w.temp}°C - ${w.description}\n💧 Umidade: ${w.humidity}%\n\n💡 _Verifique se vai chover antes de lavar roupas pesadas!_` 
                });

            case "10": 
                const hojeDia = moment().tz(TIMEZONE).day(); 
                const avisoLixo = [2,4,6].includes(hojeDia) ? "\n\n🚨 *HOJE TEM COLETA!*" : "";
                return sock.sendMessage(grupoId, { text: `🗑️ *Coleta:* Ter, Qui e Sab (após 17h).${avisoLixo}` });

            case "!resetar_lavanderia":
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar_tudo" });
                return sock.sendMessage(grupoId, { text: "⚠️ *ADMIN:* Sistema Resetado!" });
        }
    } catch (err) { console.log("❌ Erro no Módulo Lavanderia:", err.message); }
}

// --- FUNÇÃO DE EVENTOS DE GRUPO (BOAS-VINDAS E LOGS) ---
export function configurarEventosGrupo(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participantes = num.participants; 
        const saudacao = obterSaudacao();

        for (const participante of participantes) {
            // BUSCA O NOME DO PARTICIPANTE DE FORMA MAIS SEGURA
            const nomeParticipante = (await sock.getName(participante)) || participante.split('@')[0];

            if (num.action === 'add') {
                const boasVindas = `👋 ${saudacao}! Bem-vindo(a) à **JK Universitário**, *${nomeParticipante}*!\n\nDigite *Menu* para gerenciar a lavanderia. 🧺`;
                await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
                
                await axios.post(URL_GOOGLE_SCRIPT, { 
                    action: "log_evento", 
                    usuario: participante, 
                    nome: nomeParticipante, 
                    evento: "entrou" 
                }).catch(e => console.log("Erro log entrada"));
            }

            if (num.action === 'remove') {
                const adeus = `👋 O morador *${nomeParticipante}* saiu do grupo.`;
                await sock.sendMessage(idGrupo, { text: adeus });

                await axios.post(URL_GOOGLE_SCRIPT, { 
                    action: "log_evento", 
                    usuario: participante, 
                    nome: nomeParticipante, 
                    evento: "saiu" 
                }).catch(e => console.log("Erro log saída"));
            }
        }
    });
}
