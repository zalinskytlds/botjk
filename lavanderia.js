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

    try {
        const response = await axios.get(URL_GOOGLE_SCRIPT);
        const data = Array.isArray(response.data) ? response.data : [];
        const registroAtivo = data.find(r => r.status === "em_uso");
        const filaEspera = data.filter(r => r.status === "na_fila");

        switch (texto) {
            case "menu": case "oi": case "11":
                const saudacao = obterSaudacao();
                const menu = `👋 ${saudacao}!\n\n🧺 *LAVANDERIA JK*\n\n1️⃣ Dicas de uso 🧼\n2️⃣ Info da maquina ⚙️\n3️⃣ Iniciar Lavagem 🚿\n4️⃣ Finalizar Lavagem ✅\n5️⃣ Entrar na Fila ⏳\n6️⃣ Sair da Fila 🚶‍♂️\n7️⃣ Calcular peso das roupas 🎲\n8️⃣ Horário de funcionamento ⏰\n9️⃣ Previsão do tempo 🌦️\n🔟 Coleta de Lixo 🗑️`;
                return sock.sendMessage(grupoId, { text: menu });

            case "1": 
                const dicasLavanderia = [
                    "🧼 *Dica:* Verifique sempre os bolsos! Moedas, grampos e chaves podem travar a bomba de drenagem e furar o tanque da máquina.",
                    "👕 *Dica:* Lave roupas do avesso! Isso preserva a cor das peças e evita que botões ou zíperes batam diretamente no cesto de inox.",
                    "🫧 *Dica:* Menos é mais! O excesso de sabão em pó ou amaciante cria uma crosta que corrói as peças internas da máquina e mancha as roupas.",
                    "📏 *Dica:* Regra do Palmo! Para a lavagem ser eficiente, deve sobrar o espaço de um palmo fechado entre as roupas e o topo do cesto.",
                    "🧺 *Dica:* Use saquinhos protetores para roupas íntimas ou delicadas. Isso evita que ferrinhos de sutiã escapem e travem o mecanismo da máquina.",
                    "🦠 *Dica:* Após o uso, deixe a tampa da máquina aberta por alguns minutos. Isso evita o mau cheiro e a proliferação de mofo na borracha.",
                    "🧣 *Dica:* Nunca lave panos de limpeza (chão) junto com suas roupas pessoais. Além da higiene, os panos de chão costumam soltar fiapos que entopem o filtro."
                ];
                const dicaSorteada = dicasLavanderia[Math.floor(Math.random() * dicasLavanderia.length)];
                return sock.sendMessage(grupoId, { 
                    text: `💡 *DICA DO DIA - LAVANDERIA JK*\n\n${dicaSorteada}\n\n_Preserve o que é de todos!_ 🤝` 
                });

            case "2": 
                const infoLavadora = `⚙️ *ESPECIFICAÇÕES E REGRAS DA LAVANDERIA*\n\n*Equipamento:* Electrolux 8,5kg\n*Capacidade:* Até 48 peças leves ou o equivalente a 8kg.\n\n⏳ *CRONOGRAMA DE USO (LIMITE: 2 HORAS):*\nCada morador tem uma janela de **120 minutos** para completar o processo:\n• ⚡ *Rápido (19 min):* Ideal para o dia a dia.\n• 👕 *Normal / Coloridas:* ~45 min.\n• ⚪ *Brancas / Enxágue Duplo:* ~65 min.\n• 👖 *Pesado / Jeans:* ~90 min.\n\n⚠️ *ATENÇÃO:* O tempo restante após o ciclo deve ser usado para a **retirada imediata** das roupas e limpeza do filtro, liberando o espaço para o próximo agendamento.\n\n🚫 *ALERTA SOBRE SABÃO EM PÓ:*\n**É terminantemente proibido o uso de sabão em pó.** Ele acumula resíduos sólidos que **corroem o suporte do cesto e queimam o motor**. Use apenas **SABÃO LÍQUIDO** no dispenser (até a marca MAX). Danos por resíduo de pó serão cobrados como mau uso.\n\n💡 *DICA JK:*\nUse a função *Turbo Secagem* ao final para facilitar a secagem no varal, especialmente nos dias úmidos aqui de Viamão.\n\n*Respeite o tempo do próximo morador e preserve o equipamento!* 🤝`;
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
                        text: `⚠️ *FORA DO HORÁRIO DE USO*\n\nA lavanderia funciona das *07:00 às 22:00*.\n\nÚltimo horário de início: *20:00*. Respeite o silêncio após as 22:00! 🤫` 
                    });
                }

                const resIni = await axios.post(URL_GOOGLE_SCRIPT, { action: "iniciar", usuario: remetente });
                
                const tempoDeEsperaMs = 110 * 60 * 1000; 
                setTimeout(async () => {
                    const resFilaCheck = await axios.post(URL_GOOGLE_SCRIPT, { action: "verificarFila" });
                    const proximoDaFila = resFilaCheck.data.proximo; 
                    let textoAviso = `⏰ *AVISO DE FINALIZAÇÃO (10 MINUTOS)*\n\n@${remetente.split("@")[0]}, sua lavagem encerra em 10 minutos. Por favor, prepare-se para liberar a máquina.`;
                    let mencoes = [remetente];
                    if (proximoDaFila) {
                        textoAviso += `\n\n📢 *ALERTA DE FILA:* @${proximoDaFila.split("@")[0]}, você é o próximo! Já pode separar sua roupa, a máquina será liberada em breve.`;
                        mencoes.push(proximoDaFila);
                    }
                    await sock.sendMessage(grupoId, { text: textoAviso, mentions: mencoes });
                }, tempoDeEsperaMs);

                const mensagemSucesso = `🚿 *LAVAGEM INICIADA COM SUCESSO!*\n\n👤 @${remetente.split("@")[0]}\n⏰ *Início:* ${agoraSaoPaulo.format("HH:mm")}\n🏁 *Fim Previsto:* ${resIni.data.fim}\n\n🚫 *ALERTAS:*\n1️⃣ **SABÃO LÍQUIDO APENAS:** O pó danifica o motor e o tripé do cesto.\n2️⃣ **DISTRIBUIÇÃO:** Espalhe bem a roupa. Pouca roupa ou tudo de um lado só faz a máquina "pular" e trepidar.\n3️⃣ **LIMITE:** Respeite os 8,5kg para não queimar o motor.\n\n_Você receberá um aviso 10 minutos antes do término!_ 🤝`;
                return sock.sendMessage(grupoId, { 
                    text: mensagemSucesso, 
                    mentions: [remetente] 
                });

            case "4": 
                if (!registroAtivo) {
                    return sock.sendMessage(grupoId, { text: "✅ A máquina já está livre e disponível para uso!" });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID, usuario: remetente });
                let textoFinalizar = `✅ *LAVAGEM ENCERRADA!* \n\nA máquina da JK Universitário foi liberada por @${remetente.split("@")[0]}.`;
                let mencoesFim = [remetente];
                if (filaEspera && filaEspera.length > 0) {
                    const proximo = filaEspera[0].usuario;
                    textoFinalizar += `\n\n📢 *SUA VEZ:* @${proximo.split("@")[0]}, a máquina está livre! Você tem 10 minutos para iniciar sua lavagem antes de passar para o próximo da fila.`;
                    mencoesFim.push(proximo);
                } else {
                    textoFinalizar += `\n\n✨ *MÁQUINA DISPONÍVEL:* Não há ninguém na fila no momento.`;
                }
                textoFinalizar += `\n\n🧼 *Lembrete:* Verifique se não ficou nenhuma peça no cesto e deixe a tampa aberta para evitar mofo!`;
                return sock.sendMessage(grupoId, { text: textoFinalizar, mentions: mencoesFim });

            case "5": 
                if (filaEspera.some(f => f.usuario === remetente)) {
                    return sock.sendMessage(grupoId, { 
                        text: `⏳ @${remetente.split("@")[0]}, você já consta na fila de espera! Aguarde sua vez.`,
                        mentions: [remetente]
                    });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "entrarFila", usuario: remetente });
                const posicao = filaEspera.length + 1;
                let mensagemFila = `⏳ *FILA DE ESPERA - JK UNIVERSITÁRIO*\n\n✅ @${remetente.split("@")[0]}, sua solicitação foi registrada!\n📍 Sua posição atual: *${posicao}º lugar*\n\n`;
                if (posicao === 1) {
                    mensagemFila += `🚀 Você é o próximo! Assim que a máquina for liberada (Case 4), você será notificado aqui no grupo.`;
                } else {
                    mensagemFila += `📱 Fique atento ao grupo. Assim que os moradores anteriores finalizarem, o bot marcará você automaticamente.`;
                }
                mensagemFila += `\n\n⚠️ *Lembrete:* Lavanderia encerra às 22:00. Certifique-se de que sua vez não ultrapassará este horário!`;
                return sock.sendMessage(grupoId, { text: mensagemFila, mentions: [remetente] });

            case "6": 
                const usuarioNaFila = filaEspera.find(f => f.usuario === remetente);
                if (!usuarioNaFila) {
                    return sock.sendMessage(grupoId, { text: "❌ Você não está na fila de espera." });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "sairFila", usuario: remetente });
                const filaOrdenada = filaEspera.sort((a, b) => new Date(a.chegada) - new Date(b.chegada));
                const eraOPrimeiro = filaOrdenada.length > 0 && filaOrdenada[0].usuario === remetente;
                const temProximo = filaOrdenada.length > 1;
                let mensagemSaida = `🚶‍♂️ *DESISTÊNCIA REGISTRADA*\n\n@${remetente.split("@")[0]} saiu da fila de espera.`;
                let mencoesSaida = [remetente];
                if (eraOPrimeiro && temProximo) {
                    const novoPrimeiro = filaOrdenada[1].usuario;
                    mensagemSaida += `\n\n📢 *ATENÇÃO:* @${novoPrimeiro.split("@")[0]}, como houve uma desistência, **VOCÊ AGORA É O PRÓXIMO DA FILA!** 🚀\nFique atento à liberação da máquina.`;
                    mencoesSaida.push(novoPrimeiro);
                } else if (temProximo) {
                    mensagemSaida += `\n\nA fila andou! Os demais moradores subiram uma posição seguindo rigorosamente o *horário de chegada*.`;
                }
                return sock.sendMessage(grupoId, { text: mensagemSaida, mentions: mencoesSaida });

            case "7": 
                const combinacoes = [
                    "👖 *Combo Jeans (Total ~7.8kg):*\n• 5 Calças Jeans (800g cada = 4.0kg)\n• 12 Camisetas (200g cada = 2.4kg)\n• 20 Roupas Íntimas (70g cada = 1.4kg)",
                    "🧥 *Combo Inverno (Total ~7.7kg):*\n• 3 Moletons pesados (1.2kg cada = 3.6kg)\n• 4 Calças Moletom (700g cada = 2.8kg)\n• 6 Camisetas (210g cada = 1.3kg)",
                    "🛏️ *Combo Cama (Total ~7.5kg):*\n• 2 Jogos de Lençol Casal (1.5kg cada = 3.0kg)\n• 4 Fronhas (150g cada = 0.6kg)\n• 10 Toalhas de Banho (600g cada = 3.0kg)\n• 6 Panos de Prato (150g cada = 0.9kg)",
                    "👕 *Combo Verão (Total ~7.6kg):*\n• 20 Camisetas/Regatas (200g cada = 4.0kg)\n• 12 Bermudas leves (250g cada = 3.0kg)\n• 10 Pares de Meia (60g cada = 0.6kg)",
                    "🧺 *Combo Misto/Banho (Total ~7.9kg):*\n• 4 Toalhas de Banho (600g cada = 2.4kg)\n• 3 Calças Jeans (800g cada = 2.4kg)\n• 2 Moletons (1.0kg cada = 2.0kg)\n• 5 Camisetas (220g cada = 1.1kg)",
                    "👔 *Combo Trabalho/Social (Total ~7.4kg):*\n• 10 Camisas Sociais (250g cada = 2.5kg)\n• 5 Calças de Sarja/Brim (600g cada = 3.0kg)\n• 8 Toalhas de Rosto (200g cada = 1.6kg)\n• 10 Meias (30g cada = 0.3kg)"
                ];
                const sugestaoSorteada = combinacoes[Math.floor(Math.random() * combinacoes.length)];
                const msgPeso = `🧺 *GUIA DE USO CONSCIENTE - LAVANDERIA JK*\n\nPara preservar o equipamento da JK Universitário, o limite máximo é de **8kg**.\n\n💡 *EXEMPLO DE CARGA PARA HOJE:*\n${sugestaoSorteada}\n\n✅ *O QUE PODE LAVAR:*\nCamisetas, Jeans, Moletons, Roupas Íntimas, Lençóis e Toalhas comuns.\n\n❌ *ESTRITAMENTE PROIBIDO (DANIFICA A MÁQUINA):*\n• **Sapatos e Tênis** - O impacto empena o eixo e quebra o cesto.\n• **Edredons de Casal/Queen** - Pesam demais quando molhados e queimam o motor.\n• **Tapetes com Borracha** - A borracha solta e entope a bomba de drenagem.\n• **Travesseiros de Espuma (NASA)** - Absorvem água excessiva e quebram a suspensão.\n\n⚠️ *AVISO IMPORTANTE:*\nO uso é **monitorado**. Se o equipamento for danificado por itens proibidos ou excesso de peso, o custo da manutenção será **rateado entre os usuários**. \n\n*Dica:* Deixe sempre o espaço de **um palmo** livre no topo do cesto para as roupas lavarem direito! 🤝`;
                return sock.sendMessage(grupoId, { text: msgPeso });

            case "8": 
                const mensagemHorario = `🏢 *NORMAS DE USO DA LAVANDERIA JK*\n\nPrezados residentes, para o bom convívio e preservação do nosso sistema, seguem as diretrizes oficiais:\n\n⏰ *CRONOGRAMA DE OPERAÇÃO:*\n• **Início das Atividades:** 07:00h\n• **Encerramento das Atividades:** 22:00h\n• **Último Ciclo Permitido:** Deve iniciar impreterivelmente até as *20:00h* para que a máquina seja desligada no horário limite.\n\n🚫 *REGRA DE EXCLUSIVIDADE (IMPORTANTE):*\nO uso da lavanderia é um benefício **exclusivo e gratuito** para os moradores da JK Universitário. \n• É **terminantemente proibido** lavar roupas de terceiros (familiares, amigos ou visitantes). \n• O descumprimento desta regra resultará em multa imediata equivalente a **uma taxa e meia (1.5x) de consumo de água**, lançada diretamente no próximo aluguel.\n\n🌱 *USO CONSCIENTE:*\nPedimos a colaboração de todos para o uso racional da água e energia. Planeje suas lavagens, utilize a carga correta e ajude-nos a manter este serviço sustentável para todos.\n\n🤫 *SILÊNCIO:*\nApós as 22:00h, respeite o descanso dos demais moradores nas áreas comuns.\n\n_A gestão JK Universitário agradece a compreensão e o zelo com o patrimônio comum!_ 🤝`;
                return sock.sendMessage(grupoId, { text: mensagemHorario });

            case "9": 
                const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                const w = resClima.data.results;
                let iconeClima = "🌤️";
                let dicaSecagem = "";
                const condicao = w.condition_slug; 
                const vento = parseInt(w.wind_speedy);
                if (condicao.includes("rain")) {
                    iconeClima = "🌧️";
                    dicaSecagem = "⚠️ *Atenção:* Chovendo em Viamão! Use a *Turbo Secagem* ao máximo e evite pendurar roupas claras no varal externo.";
                } else if (w.temp > 28) {
                    iconeClima = "🔥";
                    dicaSecagem = "☀️ *Calorão:* Ótimo dia para secar roupas pesadas (Jeans/Moletons) no varal! Elas vão secar num vapt-vupt.";
                } else if (vento > 20) {
                    iconeClima = "🌬️";
                    dicaSecagem = "🚩 *Vento Forte:* Cuidado com as roupas leves no varal, use prendedores reforçados para não voar nada!";
                } else if (w.temp < 15) {
                    iconeClima = "❄️";
                    dicaSecagem = "🧤 *Frio:* A umidade demora a sair. Não esqueça de centrifugar bem antes de estender.";
                } else {
                    iconeClima = "🌈";
                    dicaSecagem = "✨ O tempo está firme! Aproveite para botar a lavagem em dia.";
                }
                const mensagemClima = `🌡️ *CONDIÇÕES EM VIAMÃO*\n\n${iconeClima} *Clima:* ${w.description}\n🌡️ *Temperatura:* ${w.temp}°C\n💧 *Umidade:* ${w.humidity}%\n🌬️ *Vento:* ${w.wind_speedy}\n\n---\n💡 *DICA DA LAVANDERIA:*\n${dicaSecagem}\n\n_Consulte o clima antes de iniciar um ciclo longo!_ 🤝`;
                return sock.sendMessage(grupoId, { text: mensagemClima });

            case "10": 
                const hojeDia = moment().tz(TIMEZONE).day(); 
                const avisoLixo = [2,4,6].includes(hojeDia) ? "\n\n🚨 *HOJE TEM COLETA!*" : "";
                return sock.sendMessage(grupoId, { text: `🗑️ *Coleta:* Ter, Qui e Sab (após 17h).${avisoLixo}` });

            case "!resetar_lavanderia":
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar_tudo" });
                return sock.sendMessage(grupoId, { text: "⚠️ *ADMIN:* Sistema Resetado!" });
        }
    } catch (err) { console.log("❌ Erro:", err.message); }
}

export function configurarEventosGrupo(sock) {
    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participante = num.participants[0];
        const saudacao = obterSaudacao();

        if (num.action === 'add') {
            const boasVindas = `👋 ${saudacao}! Seja bem-vindo(a) à **JK Universitário** @${participante.split('@')[0]}!\n\nSou o assistente da nossa lavanderia. Digite *Menu* para conhecer as regras e gerenciar o uso da máquina. 🧺`;
            await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
            await axios.post(URL_GOOGLE_SCRIPT, { action: "log_evento", usuario: participante, evento: "entrou" });
        }

        if (num.action === 'remove') {
            const adeus = `👋 O morador @${participante.split('@')[0]} saiu do grupo. Desejamos boa sorte na jornada!`;
            await sock.sendMessage(idGrupo, { text: adeus, mentions: [participante] });
            await axios.post(URL_GOOGLE_SCRIPT, { action: "log_evento", usuario: participante, evento: "saiu" });
        }
    });
}
