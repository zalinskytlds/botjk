import axios from "axios";
import moment from "moment-timezone";
import { GoogleGenAI } from "@google/genai";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

// Inicializa o Gemini buscando a chave do ambiente configurada no Render
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SISTEMA_BASE_JK = `Você é o assistente virtual inteligente e amigável da lavanderia da Pousada JK em Viamão/RS. 
ATENÇÃO: Você DEVE seguir estritamente as regras abaixo. NUNCA invente informações, horários, limites de peso ou exceções que fujam destas diretrizes:
- *O que pode ser lavado:* Somente roupas comuns do dia a dia e roupas leves de cama (respeitando rigorosamente o limite de peso).
- *Proibição absoluta de peças pesadas:* É proibido lavar peças que exigem muito e sobrecarregam o motor, amortecedores e cesto, tais como: edredons em geral, tênis em geral, tapetes em geral, travesseiros em geral, cobertores em geral, bichos de pelúcia em geral.
- *Outros itens que estragam a máquina:* Sutiãs com aro de metal (sem bolsa de proteção), roupas cheias de lama/areia, moedas/chaves esquecidas nos bolsos e roupas com fivelas metálicas pesadas.
- *Capacidade máxima da Electrolux:* 8,5kg (cerca de 48 peças leves). O excesso de peso queima o motor e danifica os rolamentos.
- *Regra de sabão:* Proibido estritamente usar sabão em pó (causa corrosão, entope compartimentos e queima o motor). Utilize apenas sabão líquido até a marca MAX.
- *Horário de funcionamento:* Das 07:00 às 22:00 (último início às 20:00).
- *Tempo limite por uso:* 2 horas (120 minutos).
- *Tom e Abordagem:* Mantenha um tom prestativo, comunitário, educado e use emojis de forma moderada. Se um morador perguntar sobre itens proibidos, explique educadamente que eles danificam e exigem demais do motor e da estrutura da máquina coletiva.`;

const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

// Função auxiliar para enviar logs de erro para a planilha na aba "Logdeerros"
async function enviarLogErro(erroMsg, usuario = "Desconhecido", detalhes = "") {
    try {
        if (!URL_GOOGLE_SCRIPT) return;
        await axios.post(URL_GOOGLE_SCRIPT, {
            action: "log_erro",
            modulo: "lavanderia",
            usuario: usuario,
            erro: erroMsg,
            detalhes: detalhes
        });
    } catch (e) {
        console.error("❌ Falha ao gravar log de erro na planilha:", e.message);
    }
}

// Função auxiliar atualizada para garantir compatibilidade total com a SDK do Gemini
async function gerarRespostaGemini(promptUsuario) {
    try {
        console.log("🤖 [GEMINI] A iniciar chamada para o modelo gemini-3.8-flash...");
        
        if (!process.env.GEMINI_API_KEY) {
            console.error("❌ [GEMINI] ERRO: A variável GEMINI_API_KEY não está definida no Render!");
            return null;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${SISTEMA_BASE_JK}\n\nInstrução ou Pergunta do Morador: ${promptUsuario}` }]
                }
            ]
        });
        
        console.log("🤖 [GEMINI] Resposta gerada com sucesso!");

        if (response && response.text) {
            return response.text.trim();
        }

        return null;
    } catch (error) {
        console.error("❌ [GEMINI] Erro detalhado na chamada:", error.message || error);
        await enviarLogErro(error.message || String(error), "Sistema (Gemini)", "Erro ao gerar resposta com o Gemini no módulo de lavanderia");
        return null;
    }
}

export async function tratarMensagemLavanderia(sock, msg, grupoId) {
    const textoMensagem = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    if (!textoMensagem) return;

    const texto = textoMensagem.trim().toLowerCase();
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
                await sock.sendMessage(grupoId, { text: `⏳ A consultar a inteligência artificial... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
                const prompt = "Gere 2 dicas criativas e essenciais de preservação e uso para moradores que usam uma máquina de lavar coletiva (ex: cuidar com bolsos, avesso, quantidade de sabão líquido, deixar tampa aberta). Formate com emojis e tópicos claros.";
                let dicas = await gerarRespostaGemini(prompt);
                if (!dicas) dicas = "🧼 *Dica:* Verifique sempre os bolsos e use apenas sabão líquido!";
                return sock.sendMessage(grupoId, { text: `💡 *DICAS DE USO INTELIGENTES - JK*\n\n${dicas}\n\n_Preserve o que é de todos!_ 🤝` });
            }

            case "2": {
                await sock.sendMessage(grupoId, { text: `⏳ A consultar as especificações... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
                const promptInfo = "Explique de forma organizada as especificações técnicas da lavanderia: máquina Electrolux de 8,5kg, limite estrito de 2 horas de uso por morador, proibição absoluta de sabão em pó (apenas líquido até a marca MAX), e alerta sobre danos ao motor.";
                let info = await gerarRespostaGemini(promptInfo);
                if (!info) info = "⚙️ *Especificações:* Electrolux 8,5kg. Proibido sabão em pó. Limite de 2 horas.";
                return sock.sendMessage(grupoId, { text: `⚙️ *ESPECIFICAÇÕES E REGRAS*\n\n${info}\n\n*Respeite o tempo do próximo morador!* 🤝` });
            }

            case "3": {
                const agoraSP = moment().tz(TIMEZONE);
                if (agoraSP.hour() < 7 || agoraSP.hour() >= 20) {
                    await sock.sendMessage(grupoId, { text: `⏳ A verificar as regras de horário... Por favor, aguarde.` });
                    const promptForaHorario = `O morador ${nomeMorador} tentou iniciar uma lavagem às ${agoraSP.format("HH:mm")}, mas o horário de funcionamento é das 07:00 às 22:00, sendo 20:00 o último horário permitido para início. Escreva uma mensagem amigável explicando educadamente o motivo pelo qual não é possível iniciar a lavagem agora, mencionando o morador (@${remetente.split("@")[0]}).`;
                    let msgIA = await gerarRespostaGemini(promptForaHorario);
                    if (!msgIA) msgIA = `⚠️ @${remetente.split("@")[0]}, infelizmente não é possível iniciar a lavagem agora. A lavanderia funciona das 07:00 às 22:00, e o último horário para início é às 20:00, garantindo o silêncio e descanso de todos! 🤫`;
                    return sock.sendMessage(grupoId, { text: msgIA, mentions: [remetente] });
                }

                if (registroAtivo) {
                    return sock.sendMessage(grupoId, { 
                        text: `⛔ *LAVANDERIA OCUPADA*\n\nUsuário: @${registroAtivo.usuario.split("@")[0]}\nPrevisão de término: *${registroAtivo.fim_previsto}*`, 
                        mentions: [registroAtivo.usuario] 
                    });
                }

                await sock.sendMessage(grupoId, { text: `⏳ A verificar o clima e iniciar o ciclo... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
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
                    `1️⃣ *SABÃO LÍQUIDO APENAS* (O pó danifica o motor).\n` +
                    `2️⃣ *LIMITE DE 2 HORAS* para evitar retenção da máquina.\n\n` +
                    `_Você receberá um aviso antes do término!_ 🤝`;

                return sock.sendMessage(grupoId, { text: msgSucesso, mentions: [remetente] });
            }

            case "4": {
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "✅ A máquina já está livre e disponível para uso!" });
                
                let feedbackTempo = "";
                try {
                    if (registroAtivo.inicio) {
                        const inicioUso = moment.tz(registroAtivo.inicio, TIMEZONE);
                        const fimUso = moment().tz(TIMEZONE);
                        const duracaoMinutos = fimUso.diff(inicioUso, 'minutes');

                        const parabensVariacoes = [
                            `\n\n🌟 *Excelente, @${remetente.split("@")[0]}!* Concluiu a lavagem em ${duracaoMinutos} min, respeitando o limite de 2h e colaborando com a comunidade! 🤝`,
                            `\n\n👏 *Parabéns pela pontualidade, @${remetente.split("@")[0]}!* Terminou em ${duracaoMinutos} min. Exemplo de uso consciente! ✨`,
                            `\n\n🎉 *Show de bola, @${remetente.split("@")[0]}!* Ciclo finalizado em ${duracaoMinutos} min dentro do prazo. A vizinhança agradece! 🧼`
                        ];

                        const corretivoVariacoes = [
                            `\n\n⚠️ *Aviso amigável, @${remetente.split("@")[0]}:* Você levou ${duracaoMinutos} min (${(duracaoMinutos/60).toFixed(1)}h), ultrapassando as 2h recomendadas. Fique de olho no relógio na próxima para não reter a máquina! ⏰`,
                            `\n\n💡 *Oi, @${remetente.split("@")[0]}:* O ciclo durou ${duracaoMinutos} min e passou um pouco das 2h estipuladas. Pedimos atenção para liberar o equipamento a quem está na fila! 🤝`,
                            `\n\n⚠️ *Atenção ao tempo, @${remetente.split("@")[0]}:* Foram ${duracaoMinutos} min de uso. Lembre-se que o limite é de 2h para manter a harmonia na lavanderia! ⏱️`
                        ];

                        if (duracaoMinutos <= 120) {
                            feedbackTempo = parabensVariacoes[Math.floor(Math.random() * parabensVariacoes.length)];
                        } else {
                            feedbackTempo = corretivoVariacoes[Math.floor(Math.random() * corretivoVariacoes.length)];
                        }
                    }
                } catch (e) {
                    feedbackTempo = "";
                }

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

                textoFim += feedbackTempo;
                textoFim += `\n\n🧼 *Lembrete:* Deixe a tampa aberta para evitar mofo!`;
                
                await sock.sendMessage(grupoId, { text: textoFim, mentions: mencoesFim });

                // 🌟 AVALIAÇÃO COM DELAY DE 3 MINUTOS (180000ms)
                setTimeout(async () => {
                    try {
                        const msgAvaliacao = `⭐ *AVALIAÇÃO DO ASSISTENTE - JK*\n\n` +
                            `Olá, @${remetente.split("@")[0]}! Como foi a sua experiência com o nosso bot e a organização da lavanderia hoje?\n\n` +
                            `Por favor, avalie de *1 a 5 estrelas*:\n` +
                            `1️⃣ - Péssimo\n` +
                            `2️⃣ - Ruim\n` +
                            `3️⃣ - Regular\n` +
                            `4️⃣ - Bom\n` +
                            `5️⃣ - Excelente\n\n` +
                            `_Sua opinião é muito importante para melhorarmos cada vez mais!_ 🤝`;

                        await sock.sendMessage(grupoId, { text: msgAvaliacao, mentions: [remetente] });
                    } catch (errEval) {
                        console.error("❌ Erro ao enviar mensagem de avaliação com delay:", errEval.message);
                    }
                }, 180000); // 3 minutos

                return;
            }

            case "5": {
                const agoraSP = moment().tz(TIMEZONE);
                if (agoraSP.hour() < 7 || agoraSP.hour() >= 20) {
                    await sock.sendMessage(grupoId, { text: `⏳ A verificar as regras de horário... Por favor, aguarde.` });
                    const promptFilaHorario = `O morador ${nomeMorador} tentou entrar na fila de espera da lavanderia às ${agoraSP.format("HH:mm")}, mas o horário permitido é das 07:00 às 20:00 (limite para início). Escreva uma mensagem amigável explicando que não é possível entrar na fila fora do horário de funcionamento, mencionando o morador (@${remetente.split("@")[0]}).`;
                    let msgIA = await gerarRespostaGemini(promptFilaHorario);
                    if (!msgIA) msgIA = `⚠️ @${remetente.split("@")[0]}, não é possível entrar na fila de espera neste horário. A lavanderia funciona das 07:00 às 22:00, com último início às 20:00. Retorne no horário de atendimento! ⏰`;
                    return sock.sendMessage(grupoId, { text: msgIA, mentions: [remetente] });
                }

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
                await sock.sendMessage(grupoId, { text: `⏳ A calcular as sugestões de peso... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
                const promptPeso = "Monte uma sugestão criativa de combinação de roupas (pesando no total cerca de 7.5kg a 8kg) para ajudar um morador a entender o limite seguro de carga da máquina de lavar.";
                let comboIA = await gerarRespostaGemini(promptPeso);
                if (!comboIA) comboIA = "👖 *Combo Sugerido:* 4 calças jeans + 10 camisetas + peças leves (Total ~8kg).";
                
                return sock.sendMessage(grupoId, { text: `🧺 *GUIA DE USO CONSCIENTE (Gemini)*\n\nPara preservar o equipamento, o limite é **8kg**.\n\n${comboIA}\n\n❌ *PROIBIDO:* Tênis, Edredons Casal/Queen e Tapetes.` });
            }

            case "8": {
                return sock.sendMessage(grupoId, { text: `🏢 *NORMAS DE USO DA LAVANDERIA JK*\n\n⏰ 07:00h às 22:00h (Último início: 20:00h).\n🚫 *EXCLUSIVIDADE:* Proibido lavar roupas de terceiros.\n🌱 Use com consciência!` });
            }

            case "9": {
                const agoraSP = moment().tz(TIMEZONE);
                if (agoraSP.hour() < 7 || agoraSP.hour() >= 20) {
                    const msgHorarioClima = `⚠️ @${remetente.split("@")[0]}, a consulta de tempo para lavagem não está disponível agora. A lavanderia encerra os inícios de ciclos às 20:00 e funciona até às 22:00. Bom descanso! 🌙`;
                    return sock.sendMessage(grupoId, { text: msgHorarioClima, mentions: [remetente] });
                }

                await sock.sendMessage(grupoId, { text: `⏳ A consultar a previsão do tempo... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
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
                const hojeDia = moment().tz(TIMEZONE).day(); // 2 = Terça, 4 = Quinta, 6 = Sábado
                const temColetaHoje = [2, 4, 6].includes(hojeDia);
                const avisoLixo = temColetaHoje ? "\n\n🚨 *HOJE TEM COLETA DE LIXO DA PREFEITURA!*" : "\n\n📅 *Hoje NÃO é dia de coleta oficial.*";

                await sock.sendMessage(grupoId, { text: `⏳ A consultar as orientações de descarte e coleta... Por favor, aguarde.` });

                const promptLixo = `Escreva uma orientação prática, comunitária e educativa sobre o descarte de lixo na Pousada JK. Contexto atual: ${temColetaHoje ? "Hoje TEM coleta de lixo da prefeitura (terças, quintas e sábados)." : "Hoje NÃO é dia de coleta oficial."} 
                Regras que você deve transmitir:
                1. Reforçar a separação correta entre lixo reciclável e orgânico.
                2. Informar que o descarte nos latões dos prédios deve ser feito até as 16 horas.
                3. ${temColetaHoje ? "Como os sacos de lixo já devem estar postos na rua/calçada para a coleta que ocorre após as 17h, oriente o morador a colocar o lixo diretamente na calçada se ainda não o fez, ou verificar se já está lá." : "Lembrar que nos dias sem coleta, o lixo deve ser mantido nos latões internos ou descartado corretamente sem acumular fora do horário."}
                Mantenha um tom amigável, educado e use emojis moderados.`;

                let dicasLixoIA = await gerarRespostaGemini(promptLixo);
                if (!dicasLixoIA) {
                    dicasLixoIA = `🗑️ *Orientações Gerais:*\n- Separe sempre o lixo reciclável do orgânico.\n- Descarte nos latões dos prédios até as 16h.\n- Nos dias de coleta (Ter, Qui, Sáb após 17h), o lixo vai para a calçada.`;
                }

                return sock.sendMessage(grupoId, { 
                    text: `🗑️ *COLETA E DESCARTE DE LIXO - JK*\n\nTerças, Quintas e Sábados (após 17h).${avisoLixo}\n\n${dicasLixoIA}\n\n_Colabora com a limpeza da nossa pousada!_ 🌿` 
                });
            }

            default: {
                await sock.sendMessage(grupoId, { text: `⏳ A processar sua dúvida... Por favor, aguarde, retorno com a resposta em até 2 minutos.` });
                const respostaLivre = await gerarRespostaGemini(`O morador ${nomeMorador} disse: "${texto}". Responda à dúvida dele relacionada à lavanderia ou regras da Pousada JK.`);
                if (respostaLivre) {
                    return sock.sendMessage(grupoId, { text: respostaLivre });
                }
                break;
            }
        }
    } catch (err) { 
        console.log("❌ Erro geral no módulo:", err.message); 
        await enviarLogErro(err.message || String(err), remetente, `Erro ao processar mensagem de texto: "${textoMensagem}"`);
    }
}

export function configurarEventosGrupo(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        
        const gruposLavanderia = process.env.GRUPOS_LAVANDERIA?.split(",").map(id => id.trim()) || [];
        if (!gruposLavanderia.includes(idGrupo)) return;

        for (const participante of num.participants) {
            let nomeParticipante = participante.split('@')[0];
            try {
                nomeParticipante = (await sock.getName(participante)) || nomeParticipante;
            } catch (e) {}

            const saudacao = obterSaudacao();

            if (num.action === 'add') {
                await sock.sendMessage(idGrupo, { 
                    text: `👋 ${saudacao}! Seja bem-vindo(a) à *JK Universitário* @${participante.split('@')[0]}!\n\nSou o assistente da nossa lavanderia. Digite *Menu* para conhecer as regras. 🧺`, 
                    mentions: [participante] 
                });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "log_evento", usuario: participante, nome: nomeParticipante, evento: "entrou" }).catch(()=>{});
            } else if (num.action === 'remove') {
                await axios.post(URL_GOOGLE_SCRIPT, { action: "log_evento", usuario: participante, nome: nomeParticipante, evento: "saiu" }).catch(()=>{});
            }
        }
    });
}