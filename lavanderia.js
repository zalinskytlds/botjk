import axios from "axios";
import moment from "moment-timezone";

const URL_GOOGLE_SCRIPT = process.env.URL_GOOGLE_LAVANDERIA; 
const HG_API_KEY = process.env.HGBR_API_KEY; 
const TIMEZONE = "America/Sao_Paulo";

const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

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
                // Dividindo em 2 mensagens para não dar "Ler Mais"
                await sock.sendMessage(grupoId, { text: `💡 *DICAS DE USO JK (Parte 1)*\n\n${dicasLavanderia.slice(0, 4).join('\n\n')}` });
                return sock.sendMessage(grupoId, { text: `💡 *DICAS DE USO JK (Parte 2)*\n\n${dicasLavanderia.slice(4).join('\n\n')}\n\n_Preserve o que é de todos!_ 🤝` });

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
                const agoraSP = moment().tz(TIMEZONE);
                if (agoraSP.hour() < 7 || agoraSP.hour() >= 20) {
                    return sock.sendMessage(grupoId, { text: `⚠️ *FORA DO HORÁRIO DE USO*\n\nA lavanderia funciona das *07:00 às 22:00*.\n\nÚltimo horário de início: *20:00*. Respeite o silêncio após as 22:00! 🤫` });
                }
                const resIni = await axios.post(URL_GOOGLE_SCRIPT, { action: "iniciar", usuario: remetente, nome: nomeMorador });
                const msgSucesso = `🚿 *LAVAGEM INICIADA COM SUCESSO!*\n\n👤 *Morador:* ${nomeMorador}\n⏰ *Início:* ${agoraSP.format("HH:mm")}\n🏁 *Fim Previsto:* ${resIni.data.fim}\n\n🚫 *ALERTAS:*\n1️⃣ **SABÃO LÍQUIDO APENAS:** O pó danifica o motor e o tripé do cesto.\n2️⃣ **DISTRIBUIÇÃO:** Espalhe bem a roupa. Pouca roupa ou tudo de um lado só faz a máquina "pular" e trepidar.\n3️⃣ **LIMITE:** Respeite os 8,5kg para não queimar o motor.\n\n_Você receberá um aviso 10 minutos antes do término!_ 🤝`;
                return sock.sendMessage(grupoId, { text: msgSucesso, mentions: [remetente] });

            case "4": 
                if (!registroAtivo) return sock.sendMessage(grupoId, { text: "✅ A máquina já está livre e disponível para uso!" });
                await axios.post(URL_GOOGLE_SCRIPT, { action: "finalizar", id: registroAtivo.ID, usuario: remetente });
                let textoFim = `✅ *LAVAGEM ENCERRADA!* \n\nA máquina da JK Universitário foi liberada por @${remetente.split("@")[0]}.`;
                let mencoesFim = [remetente];
                if (filaEspera.length > 0) {
                    const proximo = filaEspera[0].usuario;
                    textoFim += `\n\n📢 *SUA VEZ:* @${proximo.split("@")[0]}, a máquina está livre! Você tem 10 minutos para iniciar sua lavagem antes de passar para o próximo da fila.`;
                    mencoesFim.push(proximo);
                } else {
                    textoFim += `\n\n✨ *MÁQUINA DISPONÍVEL:* Não há ninguém na fila no momento.`;
                }
                textoFim += `\n\n🧼 *Lembrete:* Verifique se não ficou nenhuma peça no cesto e deixe a tampa aberta para evitar mofo!`;
                return sock.sendMessage(grupoId, { text: textoFim, mentions: mencoesFim });

            case "5": 
                if (filaEspera.some(f => f.usuario === remetente)) {
                    return sock.sendMessage(grupoId, { text: `⏳ @${remetente.split("@")[0]}, você já consta na fila de espera! Aguarde sua vez.`, mentions: [remetente] });
                }
                await axios.post(URL_GOOGLE_SCRIPT, { action: "entrarFila", usuario: remetente, nome: nomeMorador });
                const posicao = filaEspera.length + 1;
                let msgFila = `⏳ *FILA DE ESPERA - JK UNIVERSITÁRIO*\n\n✅ *${nomeMorador}*, sua solicitação foi registrada!\n📍 Sua posição atual: *${posicao}º lugar*\n\n`;
                msgFila += (posicao === 1) ? `🚀 Você é o próximo! Assim que a máquina for liberada, você será notificado aqui no grupo.` : `📱 Fique atento ao grupo. Assim que os moradores anteriores finalizarem, o bot marcará você automaticamente.`;
                msgFila += `\n\n⚠️ *Lembrete:* Lavanderia encerra às 22:00. Certifique-se de que sua vez não ultrapassará este horário!`;
                return sock.sendMessage(grupoId, { text: msgFila, mentions: [remetente] });

            case "6": 
                await axios.post(URL_GOOGLE_SCRIPT, { action: "sairFila", usuario: remetente });
                return sock.sendMessage(grupoId, { text: `🚶‍♂️ *DESISTÊNCIA REGISTRADA*\n\n@${remetente.split("@")[0]} saiu da fila de espera.`, mentions: [remetente] });

            case "7": 
                const combinacoes = [
                    "👖 *Combo Jeans (Total ~7.8kg):*\n• 5 Calças Jeans (800g cada = 4.0kg)\n• 12 Camisetas (200g cada = 2.4kg)\n• 20 Roupas Íntimas (70g cada = 1.4kg)",
                    "🧥 *Combo Inverno (Total ~7.7kg):*\n• 3 Moletons pesados (1.2kg cada = 3.6kg)\n• 4 Calças Moletom (700g cada = 2.8kg)\n• 6 Camisetas (210g cada = 1.3kg)",
                    "🛏️ *Combo Cama (Total ~7.5kg):*\n• 2 Jogos de Lençol Casal (1.5kg cada = 3.0kg)\n• 4 Fronhas (150g cada = 0.6kg)\n• 10 Toalhas de Banho (600g cada = 3.0kg)\n• 6 Panos de Prato (150g cada = 0.9kg)"
                ];
                const sugestao = combinacoes[Math.floor(Math.random() * combinacoes.length)];
                return sock.sendMessage(grupoId, { text: `🧺 *GUIA DE USO CONSCIENTE - LAVANDERIA JK*\n\nPara preservar o equipamento, o limite é **8kg**.\n\n💡 *EXEMPLO DE CARGA:*\n${sugestao}\n\n❌ *PROIBIDO:* Tênis, Edredons Casal/Queen, Tapetes de borracha e Travesseiros de espuma.` });

            case "8": 
                return sock.sendMessage(grupoId, { text: `🏢 *NORMAS DE USO DA LAVANDERIA JK*\n\n⏰ 07:00h às 22:00h (Último início: 20:00h).\n🚫 *EXCLUSIVIDADE:* Proibido lavar roupas de terceiros. Sujeito a multa (1.5x taxa de água).\n🌱 Use com consciência!` });

            case "9": 
                const resClima = await axios.get(`https://api.hgbrasil.com/weather?key=${HG_API_KEY}&city_name=Viamao,RS`);
                const w = resClima.data.results;
                return sock.sendMessage(grupoId, { text: `🌡️ *CONDIÇÕES EM VIAMÃO*\n\n🌤️ *Clima:* ${w.description}\n🌡️ *Temp:* ${w.temp}°C\n💧 *Umidade:* ${w.humidity}%\n\n_Consulte o clima antes de iniciar um ciclo longo!_ 🤝` });

            case "10": 
                const hojeDia = moment().tz(TIMEZONE).day(); 
                const avisoLixo = [2,4,6].includes(hojeDia) ? "\n\n🚨 *HOJE TEM COLETA!*" : "";
                return sock.sendMessage(grupoId, { text: `🗑️ *Coleta de Lixo:* Ter, Qui e Sab (após 17h).${avisoLixo}` });
        }
    } catch (err) { console.log("❌ Erro:", err.message); }
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
