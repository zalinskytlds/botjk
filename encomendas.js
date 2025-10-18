const moment = require("moment-timezone");
const axios = require("axios");

// 📦 URLs da API SheetDB (você deve substituir pelas suas URLs reais)
const URL_SHEETDB_ENCOMENDAS = process.env.SHEETDB_ENCOMENDAS || "https://sheetdb.io/api/v1/SEU_ID_ENCOMENDAS";
const URL_SHEETDB_HISTORICO = process.env.SHEETDB_HISTORICO || "https://sheetdb.io/api/v1/SEU_ID_HISTORICO";
const URL_SHEETDB_LOG = process.env.SHEETDB_LOG || "https://sheetdb.io/api/v1/7x5ujfu3x3vyb";

/**
 * Formata o horário no timezone de São Paulo
 * @param {moment.Moment} momentObj - Objeto moment
 * @returns {string} - Horário formatado
 */
function formatarHorario(momentObj) {
  return momentObj.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss");
}

/**
 * Retorna o menu principal de encomendas
 * @returns {string} - Menu formatado
 */
function obterMenuEncomendas() {
  return `📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*

1️⃣ Registrar Encomenda 📦
2️⃣ Ver Encomendas 📋
3️⃣ Confirmar Retirada ✅
4️⃣ Ver Histórico 🕓

Digite o número da opção desejada ou use os comandos:
• *!ping* - Verificar status do bot
• *!ajuda* ou *menu* - Ver este menu
• *!info* - Informações do grupo`;
}


/**
 * Registra uma nova encomenda no SheetDB
 * @param {string} usuario - Número do usuário
 * @param {string} descricao - Descrição da encomenda
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function registrarEncomenda(usuario, descricao) {
  try {
    const dataHora = formatarHorario(moment.tz("America/Sao_Paulo"));
    
    await axios.post(URL_SHEETDB_ENCOMENDAS, {
      data: [
        {
          usuario: `@${usuario}`,
          descricao: descricao || "Encomenda registrada",
          dataHora,
          status: "Aguardando retirada",
        },
      ],
    });

    // Log da ação
    await axios.post(URL_SHEETDB_LOG, {
      data: [
        {
          usuario: `@${usuario}`,
          mensagem: "Registrou encomenda",
          dataHora,
        },
      ],
    });

    console.log(`✅ Encomenda registrada para @${usuario}`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao registrar encomenda:", err.message);
    return false;
  }
}

/**
 * Busca encomendas pendentes no SheetDB
 * Filtra apenas encomendas com status "Aguardando retirada"
 * @returns {Promise<Array>} - Lista de encomendas pendentes
 */
async function buscarEncomendas() {
  try {
    const response = await axios.get(URL_SHEETDB_ENCOMENDAS);
    const todasEncomendas = response.data || [];
    
    // Filtra apenas encomendas pendentes (caso haja status diferentes)
    const enconendasPendentes = todasEncomendas.filter(
      (e) => !e.status || e.status === "Aguardando retirada"
    );
    
    return enconendasPendentes;
  } catch (err) {
    console.error("❌ Erro ao buscar encomendas:", err.message);
    return [];
  }
}

/**
 * Confirma a retirada de uma encomenda
 * Remove a encomenda da planilha principal e move para o histórico
 * @param {string} usuario - Número do usuário
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
async function confirmarRetirada(usuario) {
  try {
    const dataHora = formatarHorario(moment.tz("America/Sao_Paulo"));
    const usuarioFormatado = `@${usuario}`;
    
    // 1. Busca a encomenda do usuário antes de deletar
    const encomendas = await buscarEncomendas();
    const encomendaUsuario = encomendas.find((e) => e.usuario === usuarioFormatado);
    
    if (!encomendaUsuario) {
      console.log(`⚠️ Nenhuma encomenda encontrada para @${usuario}`);
      return false;
    }

    // 2. Deleta a encomenda da planilha principal usando o SheetDB DELETE
    // SheetDB DELETE: DELETE /usuario/@usuario_numero
    await axios.delete(`${URL_SHEETDB_ENCOMENDAS}/usuario/${encodeURIComponent(usuarioFormatado)}`);
    console.log(`🗑️ Encomenda removida da planilha principal para @${usuario}`);

    // 3. Move para histórico com informações completas
    await axios.post(URL_SHEETDB_HISTORICO, {
      data: [
        {
          usuario: usuarioFormatado,
          descricao: encomendaUsuario.descricao || "Encomenda retirada",
          dataRegistro: encomendaUsuario.dataHora || "N/A",
          dataRetirada: dataHora,
          status: "Retirada concluída",
        },
      ],
    });
    console.log(`📋 Encomenda movida para histórico para @${usuario}`);

    // 4. Log da ação
    await axios.post(URL_SHEETDB_LOG, {
      data: [
        {
          usuario: usuarioFormatado,
          mensagem: "Confirmou retirada de encomenda",
          dataHora,
        },
      ],
    });

    console.log(`✅ Retirada confirmada com sucesso para @${usuario}`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao confirmar retirada:", err.message);
    // Se o erro for 404 (não encontrou), ainda retorna true pois não há encomenda
    if (err.response?.status === 404) {
      console.log("ℹ️ Encomenda já foi removida ou não existe");
      return false;
    }
    return false;
  }
}

/**
 * Busca histórico de encomendas no SheetDB
 * @returns {Promise<Array>} - Lista do histórico
 */
async function buscarHistorico() {
  try {
    const response = await axios.get(URL_SHEETDB_HISTORICO);
    return response.data || [];
  } catch (err) {
    console.error("❌ Erro ao buscar histórico:", err.message);
    return [];
  }
}

/**
 * Envia mensagem de boas-vindas para novo membro
 * @param {Object} sock - Conexão do WhatsApp
 * @param {string} grupoId - ID do grupo
 * @param {string} participante - JID do participante
 */
async function enviarBoasVindasEncomendas(sock, grupoId, participante) {
  try {
    const numero = participante.split("@")[0];
    const hora = moment.tz("America/Sao_Paulo").hour();
    let saudacao = "Bom dia";
    if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
    else if (hora >= 18 || hora < 6) saudacao = "Boa noite";
    
    const metadata = await sock.groupMetadata(grupoId);
    
    const mensagem = `👋 ${saudacao}, @${numero}!

Seja muito bem-vindo(a) ao grupo *${metadata.subject}* 📦

Aqui você pode gerenciar suas encomendas e receber notificações quando chegar algo para você.

Digite *menu* para ver todas as opções disponíveis.`;

    await sock.sendMessage(grupoId, {
      text: mensagem,
      mentions: [participante],
    });

    console.log(`✅ Boas-vindas enviadas para @${numero} (Encomendas)`);
  } catch (err) {
    console.error("❌ Erro ao enviar boas-vindas (encomendas):", err.message);
  }
}

/**
 * Processa mensagens do grupo de encomendas
 * @param {Object} sock - Conexão do WhatsApp
 * @param {Object} msg - Objeto da mensagem
 */
async function tratarMensagemEncomendas(sock, msg) {
  const grupoId = msg.key.remoteJid;
  const remetente = msg.key.participant || msg.key.remoteJid;
  const numero = remetente.split("@")[0];
  
  // Extrai o texto da mensagem
  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ""
  ).trim().toLowerCase();

  console.log(`📦 [ENCOMENDAS] Mensagem de @${numero}: ${texto}`);

  // Responde aos comandos
  try {
    // Comando: !ping
    if (texto === "!ping") {
      await sock.sendMessage(grupoId, { text: "🟢 Bot online e funcionando!" });
      return;
    }

    // Comando: !ajuda ou menu
    if (texto === "!ajuda" || texto === "menu") {
      await sock.sendMessage(grupoId, { text: obterMenuEncomendas() });
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

    // Opção 1: Registrar Encomenda
    if (texto === "1" || texto.includes("registrar")) {
      const sucesso = await registrarEncomenda(numero, "Nova encomenda");
      
      if (sucesso) {
        await sock.sendMessage(grupoId, {
          text: `✅ *ENCOMENDA REGISTRADA*\n\n@${numero}, sua encomenda foi registrada com sucesso!\n\n📅 Data: ${formatarHorario(moment.tz("America/Sao_Paulo"))}\n\n📦 Você receberá uma notificação quando estiver disponível para retirada.`,
          mentions: [remetente],
        });
      } else {
        await sock.sendMessage(grupoId, {
          text: `❌ Erro ao registrar encomenda. Tente novamente mais tarde.`,
        });
      }
      return;
    }

    // Opção 2: Ver Encomendas
    if (texto === "2" || texto.includes("ver encomendas")) {
      await sock.sendMessage(grupoId, {
        text: "🔍 Buscando encomendas pendentes...",
      });

      const encomendas = await buscarEncomendas();
      
      if (encomendas.length === 0) {
        await sock.sendMessage(grupoId, {
          text: "✅ Não há encomendas pendentes no momento.",
        });
        return;
      }

      let lista = `📋 *ENCOMENDAS PENDENTES*\n\n`;
      encomendas.forEach((enc, index) => {
        lista += `${index + 1}. ${enc.usuario || "Usuário"}\n`;
        lista += `   📦 ${enc.descricao || "Sem descrição"}\n`;
        lista += `   📅 ${enc.dataHora || "Data não informada"}\n`;
        lista += `   ⏳ Status: ${enc.status || "Aguardando"}\n\n`;
      });

      await sock.sendMessage(grupoId, { text: lista });
      return;
    }

    // Opção 3: Confirmar Retirada
    if (texto === "3" || texto.includes("confirmar") || texto.includes("retirada")) {
      const sucesso = await confirmarRetirada(numero);
      
      if (sucesso) {
        await sock.sendMessage(grupoId, {
          text: `✅ *RETIRADA CONFIRMADA*\n\n@${numero}, obrigado por confirmar a retirada!\n\n📅 ${formatarHorario(moment.tz("America/Sao_Paulo"))}\n\n✨ Sua encomenda foi movida para o histórico.`,
          mentions: [remetente],
        });
      } else {
        await sock.sendMessage(grupoId, {
          text: `ℹ️ @${numero}, você não possui encomendas pendentes para confirmar retirada.\n\nUse a opção *2* para ver as encomendas disponíveis.`,
          mentions: [remetente],
        });
      }
      return;
    }

    // Opção 4: Ver Histórico
    if (texto === "4" || texto.includes("histórico") || texto.includes("historico")) {
      await sock.sendMessage(grupoId, {
        text: "🔍 Buscando histórico...",
      });

      const historico = await buscarHistorico();
      
      if (historico.length === 0) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Nenhum registro no histórico.",
        });
        return;
      }

      let lista = `🕓 *HISTÓRICO DE ENCOMENDAS*\n\n`;
      
      // Mostra os últimos 10 registros
      const ultimos = historico.slice(-10).reverse();
      ultimos.forEach((reg, index) => {
        lista += `${index + 1}. ${reg.usuario || "Usuário"}\n`;
        lista += `   📦 ${reg.descricao || reg.mensagem || "Sem descrição"}\n`;
        lista += `   📅 Registrada: ${reg.dataRegistro || reg.dataHora || "N/A"}\n`;
        lista += `   ✅ Retirada: ${reg.dataRetirada || "N/A"}\n`;
        lista += `   🔖 Status: ${reg.status || "Concluída"}\n\n`;
      });

      await sock.sendMessage(grupoId, { text: lista });
      return;
    }

  } catch (err) {
    console.error("❌ Erro ao processar mensagem de encomendas:", err.message);
    await sock.sendMessage(grupoId, {
      text: "❌ Desculpe, ocorreu um erro ao processar seu comando. Tente novamente.",
    });
  }
}

module.exports = {
  tratarMensagemEncomendas,
  enviarBoasVindasEncomendas,
};
