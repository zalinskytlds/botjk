const moment = require("moment-timezone");
const axios = require("axios");

// 🧺 Variáveis de controle da lavanderia
let filaDeEspera = [];
let lavagemAtiva = null;

/**
 * Formata o horário no timezone de São Paulo
 * @param {moment.Moment} momentObj - Objeto moment
 * @returns {string} - Horário formatado
 */
function formatarHorario(momentObj) {
  return momentObj.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss");
}

/**
 * Retorna saudação baseada no horário atual
 * @returns {string} - "Bom dia", "Boa tarde" ou "Boa noite"
 */
function obterSaudacao() {
  const hora = moment.tz("America/Sao_Paulo").hour();
  if (hora >= 6 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Retorna o menu principal da lavanderia
 * @returns {string} - Menu formatado
 */
function obterMenuLavanderia() {
  return `🧺 *MENU LAVANDERIA UNIVERSITÁRIA*

1️⃣ Dicas de uso 🧼
2️⃣ Info Lavadora ⚙️
3️⃣ Iniciar Lavagem 🚿
4️⃣ Finalizar Lavagem ✅
5️⃣ Entrar na Fila ⏳
6️⃣ Sair da Fila 🚶‍♂️
7️⃣ Sortear Roupas 🎲
8️⃣ Horário de Funcionamento ⏰
9️⃣ Previsão do Tempo 🌦️
🔟 Coleta de Lixo 🗑️

Digite o número da opção desejada ou use os comandos:
• *!ping* - Verificar status do bot
• *!ajuda* ou *menu* - Ver este menu
• *!info* - Informações do grupo
• *!todos* - Mencionar todos os membros`;
}

/**
 * Envia mensagem de boas-vindas para novo membro
 * @param {Object} sock - Conexão do WhatsApp
 * @param {string} grupoId - ID do grupo
 * @param {string} participante - JID do participante
 */
async function enviarBoasVindas(sock, grupoId, participante) {
  try {
    const numero = participante.split("@")[0];
    const saudacao = obterSaudacao();
    const metadata = await sock.groupMetadata(grupoId);
    
    const mensagem = `👋 ${saudacao}, @${numero}!

Seja muito bem-vindo(a) ao grupo *${metadata.subject}* 🧺

Aqui você pode gerenciar o uso das máquinas de lavar e ver horários disponíveis.

Digite *menu* para ver todas as opções disponíveis.`;

    await sock.sendMessage(grupoId, {
      text: mensagem,
      mentions: [participante],
    });

    console.log(`✅ Boas-vindas enviadas para @${numero}`);
  } catch (err) {
    console.error("❌ Erro ao enviar boas-vindas:", err.message);
  }
}

/**
 * Processa mensagens do grupo de lavanderia
 * @param {Object} sock - Conexão do WhatsApp
 * @param {Object} msg - Objeto da mensagem
 */
async function tratarMensagemLavanderia(sock, msg) {
  const grupoId = msg.key.remoteJid;
  const remetente = msg.key.participant || msg.key.remoteJid;
  const numero = remetente.split("@")[0];
  
  // Extrai o texto da mensagem
  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ""
  ).trim().toLowerCase();

  console.log(`🧺 [LAVANDERIA] Mensagem de @${numero}: ${texto}`);

  // Responde aos comandos
  try {
    // Comando: !ping
    if (texto === "!ping") {
      await sock.sendMessage(grupoId, { text: "🟢 Bot online e funcionando!" });
      return;
    }

    // Comando: !ajuda ou menu
    if (texto === "!ajuda" || texto === "menu") {
      await sock.sendMessage(grupoId, { text: obterMenuLavanderia() });
      return;
    }

    // Comando: !info
    if (texto === "!info") {
      const metadata = await sock.groupMetadata(grupoId);
      const info = `ℹ️ *INFORMAÇÕES DO GRUPO*

📌 Nome: ${metadata.subject}
👥 Participantes: ${metadata.participants.length}
📝 Descrição: ${metadata.desc || "Sem descrição"}
🕒 Criado em: ${new Date(metadata.creation * 1000).toLocaleDateString("pt-BR")}`;
      
      await sock.sendMessage(grupoId, { text: info });
      return;
    }

    // Comando: !todos
    if (texto === "!todos") {
      const metadata = await sock.groupMetadata(grupoId);
      const mentions = metadata.participants.map((p) => p.id);
      const mentionText = metadata.participants
        .map((p) => `@${p.id.split("@")[0]}`)
        .join(" ");
      
      await sock.sendMessage(grupoId, {
        text: `📢 *ATENÇÃO GERAL*\n\n${mentionText}`,
        mentions,
      });
      return;
    }

    // Opção 1: Dicas de uso
    if (texto === "1" || texto.includes("dicas")) {
      const dicas = `🧼 *DICAS DE USO DA LAVANDERIA*

✅ Separe roupas por cor (brancas, claras, escuras)
✅ Verifique os bolsos antes de lavar
✅ Use sabão na quantidade recomendada
✅ Não sobrecarregue a máquina
✅ Retire as roupas logo após o ciclo
✅ Limpe o filtro após cada uso
✅ Deixe a máquina aberta após usar

💡 *Dica extra:* Configure alarme para não esquecer suas roupas na máquina!`;
      
      await sock.sendMessage(grupoId, { text: dicas });
      return;
    }

    // Opção 2: Info Lavadora
    if (texto === "2" || texto.includes("info lavadora")) {
      const info = `⚙️ *INFORMAÇÕES DA LAVADORA*

🏷️ Marca: Electrolux
📊 Capacidade: 12kg
⚡ Potência: 1200W
💧 Ciclos disponíveis:
  • Rápido (30 min)
  • Normal (60 min)
  • Pesado (90 min)
  • Delicado (45 min)

🌡️ Temperaturas: Fria, Morna, Quente
🔄 Status atual: ${lavagemAtiva ? "🔴 Em uso" : "🟢 Disponível"}`;
      
      await sock.sendMessage(grupoId, { text: info });
      return;
    }

    // Opção 3: Iniciar Lavagem
    if (texto === "3" || texto.includes("iniciar")) {
      if (lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ A máquina já está em uso por @${lavagemAtiva.usuario}!\n\nDigite *5* para entrar na fila.`,
          mentions: [lavagemAtiva.jid],
        });
        return;
      }

      lavagemAtiva = {
        usuario: numero,
        jid: remetente,
        inicio: moment.tz("America/Sao_Paulo"),
      };

      await sock.sendMessage(grupoId, {
        text: `🚿 *LAVAGEM INICIADA*\n\n@${numero} está usando a lavadora!\n⏰ Início: ${formatarHorario(lavagemAtiva.inicio)}\n\n⏱️ Não esqueça de finalizar quando terminar (opção 4)`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 4: Finalizar Lavagem
    if (texto === "4" || texto.includes("finalizar")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Nenhuma lavagem está ativa no momento.",
        });
        return;
      }

      if (lavagemAtiva.jid !== remetente) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ Apenas @${lavagemAtiva.usuario} pode finalizar esta lavagem.`,
          mentions: [lavagemAtiva.jid],
        });
        return;
      }

      const fim = moment.tz("America/Sao_Paulo");
      const duracao = moment.duration(fim.diff(lavagemAtiva.inicio));
      const minutos = Math.floor(duracao.asMinutes());

      await sock.sendMessage(grupoId, {
        text: `✅ *LAVAGEM FINALIZADA*\n\n@${numero} terminou de usar a lavadora!\n⏱️ Duração: ${minutos} minutos\n\n${filaDeEspera.length > 0 ? `Próximo da fila: @${filaDeEspera[0].usuario}` : "🟢 Máquina disponível!"}`,
        mentions: filaDeEspera.length > 0 ? [remetente, filaDeEspera[0].jid] : [remetente],
      });

      lavagemAtiva = null;
      
      // Remove o primeiro da fila
      if (filaDeEspera.length > 0) {
        filaDeEspera.shift();
      }
      return;
    }

    // Opção 5: Entrar na Fila
    if (texto === "5" || texto.includes("entrar na fila")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: "🟢 A máquina está disponível! Use a opção *3* para iniciar.",
        });
        return;
      }

      const jaEstaFila = filaDeEspera.find((p) => p.jid === remetente);
      if (jaEstaFila) {
        await sock.sendMessage(grupoId, {
          text: `ℹ️ Você já está na fila, @${numero}!`,
          mentions: [remetente],
        });
        return;
      }

      filaDeEspera.push({ usuario: numero, jid: remetente });
      
      await sock.sendMessage(grupoId, {
        text: `⏳ @${numero} entrou na fila!\n📊 Posição: ${filaDeEspera.length}º\n\n*Fila atual:*\n${filaDeEspera.map((p, i) => `${i + 1}. @${p.usuario}`).join("\n")}`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 6: Sair da Fila
    if (texto === "6" || texto.includes("sair da fila")) {
      const index = filaDeEspera.findIndex((p) => p.jid === remetente);
      
      if (index === -1) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Você não está na fila.",
        });
        return;
      }

      filaDeEspera.splice(index, 1);
      
      await sock.sendMessage(grupoId, {
        text: `🚶‍♂️ @${numero} saiu da fila!`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 7: Sortear Roupas
    if (texto === "7" || texto.includes("sortear")) {
      const roupas = ["👕 Camiseta", "👖 Calça", "🧦 Meias", "👔 Camisa", "🩳 Shorts", "🧥 Jaqueta", "👗 Vestido", "🩱 Roupa íntima"];
      const sorteada = roupas[Math.floor(Math.random() * roupas.length)];
      
      await sock.sendMessage(grupoId, {
        text: `🎲 *SORTEIO DE ROUPAS*\n\n@${numero} tirou: ${sorteada}!\n\n😄 Boa sorte na lavagem!`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 8: Horário de Funcionamento
    if (texto === "8" || texto.includes("horário") || texto.includes("horario")) {
      const horarios = `⏰ *HORÁRIO DE FUNCIONAMENTO*

🗓️ Segunda a Sexta: 06:00 - 22:00
🗓️ Sábado: 08:00 - 20:00
🗓️ Domingo: 08:00 - 18:00

⚠️ *Atenção:* Respeite os horários de silêncio
🔕 Evite usar após 22h em dias de semana`;
      
      await sock.sendMessage(grupoId, { text: horarios });
      return;
    }

    // Opção 9: Previsão do Tempo
    if (texto === "9" || texto.includes("previsão") || texto.includes("previsao") || texto.includes("tempo")) {
      const previsoes = [
        "☀️ Sol - Ótimo dia para secar roupas!",
        "⛅ Parcialmente nublado - Bom para lavar",
        "🌤️ Sol com nuvens - Pode secar tranquilo",
        "🌧️ Chuva prevista - Melhor secar dentro",
        "⛈️ Tempestade - Evite estender roupas fora",
      ];
      const previsao = previsoes[Math.floor(Math.random() * previsoes.length)];
      
      await sock.sendMessage(grupoId, {
        text: `🌦️ *PREVISÃO DO TEMPO*\n\n${previsao}\n\n📍 Localização: São Paulo\n🕐 Atualizado: ${formatarHorario(moment.tz("America/Sao_Paulo"))}`,
      });
      return;
    }

    // Opção 10: Coleta de Lixo
    if (texto === "10" || texto.includes("lixo") || texto.includes("coleta")) {
      const hoje = moment.tz("America/Sao_Paulo").day();
      const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      
      const coleta = `🗑️ *COLETA DE LIXO*

📅 Hoje é ${dias[hoje]}

🟢 Orgânico: Segunda, Quarta, Sexta
♻️ Reciclável: Terça, Quinta
🔵 Não reciclável: Sábado

⏰ Horário: Deixar até 19h na área designada

💡 *Lembre-se:* Separe corretamente para ajudar o meio ambiente!`;
      
      await sock.sendMessage(grupoId, { text: coleta });
      return;
    }

  } catch (err) {
    console.error("❌ Erro ao processar mensagem da lavanderia:", err.message);
    await sock.sendMessage(grupoId, {
      text: "❌ Desculpe, ocorreu um erro ao processar seu comando. Tente novamente.",
    });
  }
}

module.exports = {
  tratarMensagemLavanderia,
  enviarBoasVindas,
};
