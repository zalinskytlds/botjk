import axios from "axios";
import moment from "moment-timezone";
import cron from "node-cron";

const URL = process.env.URL_GOOGLE_ENCOMENDAS;
const TIMEZONE = "America/Sao_Paulo";
const GRUPOS_ENCOMENDAS = process.env.GRUPOS_ENCOMENDAS?.split(",").map(id => id.trim()) || [];
let sessoesEncomenda = {}; 

const obterSaudacao = () => {
    const hora = moment().tz(TIMEZONE).hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
};

// ⏰ ROTINAS AUTOMÁTICAS (ENCOMENDAS E LIXO)
export function iniciarRotinaEncomendas(sock) {

    // 1️⃣ CRON DE ENCOMENDAS (Todos os dias às 08:00)
    cron.schedule('0 8 * * *', async () => {
        console.log("📦 [CRON] Consultando encomendas para lembretes e atrasos no grupo...");
        if (!URL) return console.error("❌ ERRO: URL_GOOGLE_ENCOMENDAS não definida para o cron!");

        try {
            const resCons = await axios.post(URL, { action: "consultar" });
            const lista = resCons.data.lista || [];
            
            if (lista.length === 0) return;

            const hojeMoment = moment().tz(TIMEZONE).startOf('day');
            const hojeStr = hojeMoment.format("DD/MM/YYYY");

            for (const grupoId of GRUPOS_ENCOMENDAS) {
                for (const enc of lista) {
                    const idEncomenda = enc[0];
                    const dataPrevistaStr = enc[1];
                    const loja = enc[2];
                    const nomeMorador = enc[3];
                    const usuarioJid = enc[4] || ""; 

                    if (!dataPrevistaStr) continue;

                    const dataPrevistaMoment = moment(dataPrevistaStr, "DD/MM/YYYY", true);
                    if (!dataPrevistaMoment.isValid()) continue;

                    let mencoes = [];
                    let avisoMorador = `*${nomeMorador}*`;

                    if (usuarioJid && usuarioJid.includes("@")) {
                        mencoes.push(usuarioJid);
                        avisoMorador = `@${usuarioJid.split("@")[0]}`;
                    }

                    if (dataPrevistaStr === hojeStr) {
                        const msgLembrete = `📦 *LEMBRETE DE ENCOMENDA - JK*\n\n` +
                            `Olá ${avisoMorador}! Consta aqui que a sua encomenda da *${loja}* (ID: ${idEncomenda}) tem previsão de entrega para *hoje (${dataPrevistaStr})*.\n\n` +
                            `Fique atento(a) e, assim que receber, lembre-se de registrar o recebimento aqui no grupo! 🚚✨`;

                        await sock.sendMessage(grupoId, { text: msgLembrete, mentions: mencoes });
                    }
                    else if (dataPrevistaMoment.isBefore(hojeMoment)) {
                        const diasAtraso = hojeMoment.diff(dataPrevistaMoment, 'days');
                        
                        const msgExpirada = `⚠️ *ENCOMENDA COM DATA EXPIRADA - JK*\n\n` +
                            `Olá ${avisoMorador}! A previsão da sua encomenda da *${loja}* (ID: ${idEncomenda}) era para *${dataPrevistaStr}* (já passou há ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}).\n\n` +
                            `Se você já recebeu, por favor digite *ID ${idEncomenda}* para dar baixa ou verifique com a administração! 🔍📋`;

                        await sock.sendMessage(grupoId, { text: msgExpirada, mentions: mencoes });
                    }
                }
            }
            console.log("✅ [CRON] Verificação de encomendas e menções no grupo concluída.");
        } catch (err) {
            console.error("❌ [CRON] Erro ao consultar encomendas para verificação:", err.message);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
    });

    // 2️⃣ CRON DIÁRIO DE SEPARAÇÃO DE LIXO E VIDRO (Todos os dias às 10:00)
    cron.schedule('0 10 * * *', async () => {
        console.log("♻️ [CRON] Enviando lembrete diário de separação de lixo e vidro...");
        try {
            for (const grupoId of GRUPOS_ENCOMENDAS) {
                const msgSeparacao = `♻️ *DICA DE CONVIVÊNCIA E SUSTENTABILIDADE - JK*\n\n` +
                    `Lembrete importante para todos os moradores:\n\n` +
                    `🛍️ *Plásticos e Latas:* Por favor, coloque estes itens em *sacolas separadas* (diferentes do lixo de banheiro e cozinha). Isso facilita muito o trabalho dos catadores e evita que os sacos rasguem!\n\n` +
                    `🔍 *Descarte de Vidro Quebrado:* Ao descartar vidro quebrado, coloque-o obrigatoriamente dentro de uma *embalagem de papelão ou recipiente rígido fechado*. A embalagem precisa estar **lacrada com tampa ou fita adesiva** para evitar acidentes graves com quem recolhe os resíduos. 🤝✨`;
                
                await sock.sendMessage(grupoId, { text: msgSeparacao });
            }
        } catch (err) {
            console.error("❌ Erro ao enviar lembrete diário de separação de lixo:", err.message);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
    });

    // 3️⃣ CRON DOS DIAS DE COLETA (Terças, Quintas e Sábados às 13:30)
    cron.schedule('30 13 * * 2,4,6', async () => {
        console.log("🗑️ [CRON] Enviando lembrete de coleta de lixo da prefeitura...");
        try {
            for (const grupoId of GRUPOS_ENCOMENDAS) {
                const msgColeta = `🚨 *LEMBRETE DE COLETA DE LIXO - Pousada JK*\n\n` +
                    `Hoje tem coleta da prefeitura!\n\n` +
                    `⏰ *Horário limite:* Pedimos que o descarte nos latões seja feito até as *14:00 horas*.\n` +
                    `📦 *Organização:* Quando os sacos pretos já estiverem na calçada, deposite o seu lixo junto a eles.\n` +
                    `⚠️ *Após as 14:00:* Se os latões já estiverem vazios e os sacos da coleta já estiverem na calçada, por favor, deposite o lixo ao lado deles de forma organizada. 🌿`;
                
                await sock.sendMessage(grupoId, { text: msgColeta });
            }
        } catch (err) {
            console.error("❌ Erro ao enviar lembrete de coleta de lixo:", err.message);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
    });
}

export async function tratarMensagemEncomendas(sock, msg, grupoId) {
    const jid = msg.key.participant || msg.key.remoteJid;
    const textoRaw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const textoLow = textoRaw.toLowerCase();

    if (!URL) return console.error("ERRO: URL_GOOGLE_ENCOMENDAS não definida!");

    try {
        // --- 1. COMANDO DE BAIXA DIRETA ---
        if (textoLow.startsWith("id ") && !sessoesEncomenda[jid]) {
            const idBuscado = textoLow.replace(/\D/g, "").trim();
            if (!idBuscado) return sock.sendMessage(grupoId, { text: "❌ Informe o número do ID (Ex: id 2)" });

            sessoesEncomenda[jid] = { etapa: "pergunta_quem_recebeu", idParaBaixa: idBuscado };
            return sock.sendMessage(grupoId, { text: `🤝 *ID ${idBuscado} localizado!* \n\nInforme quem está recebendo a encomenda agora?` });
        }

        // --- 2. MENU E VOLTAR ---
        if (["menu", "sair", "oi", "ola"].includes(textoLow)) {
            delete sessoesEncomenda[jid];
            const saudacao = obterSaudacao();
            const menu = `📦 ${saudacao}!\n\n*JK UNIVERSITÁRIO - ENCOMENDAS*\n\n1️⃣ Registrar encomenda\n2️⃣ Consultar encomenda\n3️⃣ Registrar recebimento\n4️⃣ Ver Histórico\n\n👉 _Digite o número desejado ou use "ID [número]"_`;
            return sock.sendMessage(grupoId, { text: menu });
        }

        // --- 3. LÓGICA DE REGISTRO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_data") {
            let dataDigitada = textoRaw;
            
            const dataFormatada = moment(dataDigitada, "DD/MM", true).isValid() 
                ? moment(dataDigitada, "DD/MM").format("DD/MM/YYYY") 
                : dataDigitada;

            sessoesEncomenda[jid].dataPrevista = dataFormatada;
            sessoesEncomenda[jid].etapa = "pergunta_loja";
            return sock.sendMessage(grupoId, { text: "🛍️ De onde é a encomenda? (Ex: Amazon, Shopee):" });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_loja") {
            sessoesEncomenda[jid].loja = textoRaw;
            sessoesEncomenda[jid].etapa = "pergunta_nome";
            return sock.sendMessage(grupoId, { text: "👤 Informe o seu nome:" });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_nome") {
            const dados = sessoesEncomenda[jid];
            const nomeInquilino = textoRaw.toUpperCase();

            await axios.post(URL, { 
                action: "registrar", 
                dataPrevista: dados.dataPrevista, 
                loja: dados.loja, 
                nome: nomeInquilino, 
                usuario: jid 
            });

            const mensagemConfirmacao = `✅ Ok, *${nomeInquilino}* (@${jid.split("@")[0]}), sua compra da *${dados.loja}* com previsão para *${dados.dataPrevista}* foi anotada!\n\n🔔 Fique atento(a) para registrar o recebimento aqui no grupo quando chegar.`;

            delete sessoesEncomenda[jid];
            return sock.sendMessage(grupoId, { text: mensagemConfirmacao, mentions: [jid] });
        }

        // --- 4. LÓGICA DE RECEBIMENTO ---
        if (sessoesEncomenda[jid]?.etapa === "pergunta_id_baixa") {
            const idLimpo = textoRaw.replace(/\D/g, "").trim();
            sessoesEncomenda[jid].idParaBaixa = idLimpo;
            sessoesEncomenda[jid].etapa = "pergunta_quem_recebeu";
            return sock.sendMessage(grupoId, { text: `🤝 Entendido. E quem está recebendo a encomenda do ID ${idLimpo}?` });
        }

        if (sessoesEncomenda[jid]?.etapa === "pergunta_quem_recebeu") {
            const idBuscado = sessoesEncomenda[jid].idParaBaixa;
            const quemRecebeu = textoRaw;

            const res = await axios.post(URL, { 
                action: "receber", 
                id: idBuscado,
                dataChegada: moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm"),
                quemRecebeu: quemRecebeu 
            });

            if (res.data.status === "success") {
                const donoJid = res.data.dono;
                const msgSucesso = `✅ *ENCOMENDA ENTREGUE!*\n\n📦 *ID:* ${idBuscado}\n👤 *Recebido por:* ${quemRecebeu}\n🔔 *Aviso:* @${donoJid.split("@")[0]}, sua encomenda chegou!`;
                delete sessoesEncomenda[jid];
                return sock.sendMessage(grupoId, { text: msgSucesso, mentions: [donoJid] });
            } else {
                delete sessoesEncomenda[jid];
                return sock.sendMessage(grupoId, { text: `❌ Erro: ID *${idBuscado}* não encontrado.` });
            }
        }

        // --- 5. OPÇÕES DO MENU ---
        switch (textoLow) {
            case "1":
                sessoesEncomenda[jid] = { etapa: "pergunta_data" };
                return sock.sendMessage(grupoId, { text: "📅 Qual a data prevista? (Ex: 10/04)" });
            case "2": {
                const resCons = await axios.post(URL, { action: "consultar" });
                const lista = resCons.data.lista || [];
                
                if (lista.length === 0) {
                    return sock.sendMessage(grupoId, { text: "📭 *Não há encomendas aguardando no momento.*" });
                }

                let msgLista = "🔍 *ENCOMENDAS AGUARDANDO:*\n";
                msgLista += "__________________________\n\n";

                lista.forEach(r => {
                    msgLista += `🆔 *ID: ${r[0]}*\n`;
                    msgLista += `👤 *NOME:* ${r[3]}\n`;
                    msgLista += `🛍️ *LOJA:* ${r[2]}\n`;
                    msgLista += `📅 *CHEGA EM:* ${r[1]}\n`;
                    msgLista += "__________________________\n\n";
                });

                msgLista += "_Para dar baixa, digite: ID [número]_";
                return sock.sendMessage(grupoId, { text: msgLista });
            }
            case "3": {
                const resBaixa = await axios.post(URL, { action: "consultar" });
                const listaB = resBaixa.data.lista || [];
                if (listaB.length === 0) return sock.sendMessage(grupoId, { text: "📭 Nada para receber." });
                sessoesEncomenda[jid] = { etapa: "pergunta_id_baixa" };
                let msgBaixa = "📦 *CONFIRMAR RECEBIMENTO*\nDigite o número do ID:\n\n";
                listaB.forEach(r => msgBaixa += `🆔 *ID ${r[0]}* - ${r[3]}\n`);
                return sock.sendMessage(grupoId, { text: msgBaixa });
            }
            case "4": {
                const resHist = await axios.post(URL, { action: "historico" });
                const listaH = resHist.data.lista || [];

                if (listaH.length === 0) {
                    return sock.sendMessage(grupoId, { text: "📜 *O histórico de entregas está vazio.*" });
                }

                let msgHist = "📜 *ÚLTIMAS ENTREGAS REALIZADAS*\n";
                msgHist += "__________________________\n\n";

                listaH.slice(-10).reverse().forEach(r => {
                    msgHist += `✅ *ID ${r[0]}* | ${r[3]}\n`;
                    msgHist += `📦 *ORIGEM:* ${r[2].toUpperCase()}\n`; 
                    msgHist += `🏁 *ENTREGUE EM:* ${r[6]}\n`;
                    msgHist += "__________________________\n\n";
                });

                return sock.sendMessage(grupoId, { text: msgHist });
            }
        }
    } catch (error) {
        return sock.sendMessage(grupoId, { text: "❌ Sistema temporariamente indisponível." });
    }
}

export function configurarEventosEncomendas(sock) {
    iniciarRotinaEncomendas(sock);

    sock.ev.on('group-participants.update', async (num) => {
        const idGrupo = num.id;
        const participante = num.participants[0];
        const saudacao = obterSaudacao();
        if (num.action === 'add') {
            const boasVindas = `📦 ${saudacao}! Bem-vindo(a) @${participante.split('@')[0]}! Use *Menu* para gerenciar suas encomendas. 🚀`;
            await sock.sendMessage(idGrupo, { text: boasVindas, mentions: [participante] });
        }
    });
}