const moment = require("moment-timezone");
const axios = require("axios");

let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss");
}

function obterSaudacao() {
  const hora = moment.tz("America/Sao_Paulo").hour();
  if (hora >= 6 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function obterMenuLavanderia() {
  return `🧺 *MENU LAVANDERIA JK UNIVERSITÁRIO*

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
• *!info* - Informações do grupo;`;
}

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

async function tratarMensagemLavanderia(sock, msg) {
  try {
    const grupoId = msg.key.remoteJid;
    const remetente = msg.key.participant || msg.key.remoteJid;
    const numero = remetente.split("@")[0];
    const texto = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase();

    console.log(`🧺 [LAVANDERIA] Mensagem de @${numero}: ${texto}`);

    // ----------------------
    // Menu
    if (texto === "menu" || texto === "!ajuda") {
      await sock.sendMessage(grupoId, { text: obterMenuLavanderia() });
      return;
    }

    // ----------------------
    // ----------------------
// Opção 2 - Info Lavadora (otimizada)
if (texto === "2") {
  const mensagens = [
    `🧾 *Informações da Lavadora*\nElectrolux 8,5Kg LT09E\n\n*Especificações*\nCapacidade: 3-10 kg\nConsumo de energia: 0,26 KWh/ciclo\nSistema de lavagem: Agitação\nTipo de abertura: Superior\nPlugue: 10A\nQuantidade de níveis de roupa: 4`,
    `*Este Produto inclui*\nÁgua quente: Não\nCesto: Polipropileno\nDispenser para alvejante: Sim\nDispenser para amaciante: Sim\nDispenser para sabão em pó: Sim\nFiltro elimina fiapos: Sim\nInterior de aço inox: Não\nPainel digital: Não\nPainel mecânico: Sim`,
    `*Programas de lavagem*\n12 programas\nSistema de lavagem: Agitação\nVisualizador de etapas de lavagem: Sim\nDispenser para sabão líquido: Sim\nTipo de abertura: Superior\nMaterial do cesto: Polipropileno\nMotor direct drive: Não\nFunção lava tênis: Sim\nPrograma preferido: Não`,
    `Sensor automático de carga de roupas: Não\nReaproveitamento de água: Sim\nEsterilização: Não\nFunção passa fácil: Não\nPré-lavagem: Não\nPés niveladores: Sim\nControle de temperatura: Não\nSilenciosa: Sim\nAlças laterais: Não`,
    `*Funções*\nTurbo Agitação\nTurbo Secagem\nReutilização de Água\nAvança Etapas\nPerfect dilution\nCiclos rápidos: 19 min\nPainel: Mecânico\nProgramas: Pesado/jeans, Tira manchas, Limpeza de cesto, Rápido, Tênis, Edredom, Escuras, Coloridas, Brancas, Cama & banho, Delicado, Normal`,
    `*Etapas de lavagem*\nMolho longo, Molho normal, Molho curto, Enxágue, Centrifugação\nProgramas disponíveis: Rápido, Tênis, Edredom, Brancas, Cama & banho, Normal, Super silencioso: Não, Pesado/intenso, Delicado/fitness: Não\nJatos poderosos: Não\nVapor: Não\nControle de molho: Sim`,
    `Molho: Sim\nReutilizar água: Sim\nTurbo lavagem: Sim\nCiclo silencioso: Não\nWifi: Não\nIniciar/pausar: Não\nQuantidade de níveis de roupa: 4\nTamanho do edredom: Solteiro`,
    `*Especificações técnicas*\nInstalação gratuita: Não\nConteúdo da embalagem: 1 máquina de lavar, 1 guia rápido, 1 curva da mangueira\nGarantia do produto: 1 ano\nEAN-13: 7896584070767 / 7896584070774\nTensão: 127 ou 220V\nCor: Branco`,
    `Altura do produto embalado: 105,5 cm\nCapacidade de lavagem: 8,5 kg\nLargura do produto embalado: 57,4 cm\nProfundidade do produto embalado: 63 cm\nEcoPlus: Não\nPeso do produto embalado: 34,3 kg`
  ];

  // Loop assíncrono otimizado
  (async () => {
    for (const mensagem of mensagens) {
      await sock.sendMessage(grupoId, { text: mensagem });
      await new Promise(res => setTimeout(res, 20000)); // 20s de intervalo
    }
  })();

  return;
}


    // ----------------------
    // Opção 3 - Iniciar Lavagem
    if (texto === "3" || texto.includes("iniciar")) {
      if (lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ A máquina já está em uso por @${lavagemAtiva.usuario}!\n\nDigite *5* para entrar na fila.`,
          mentions: [lavagemAtiva.jid],
        });
        return;
      }

      const saudacao = obterSaudacao();
      const inicio = moment.tz("America/Sao_Paulo");
      const fim = inicio.clone().add(2, "hours");
      const tempoAvisoAntesDoFim = 10;

      lavagemAtiva = { usuario: numero, jid: remetente, inicio, fim };

      await sock.sendMessage(grupoId, {
        text: `${saudacao}, @${numero}! 🧺 Sua lavagem foi iniciada às ${formatarHorario(inicio)}.\n⏱️ Término previsto para ${formatarHorario(fim)}.`,
        mentions: [remetente],
      });

      setTimeout(async () => {
        await sock.sendMessage(grupoId, {
          text: `🔔 @${numero}, sua lavagem vai finalizar em ${tempoAvisoAntesDoFim} minutos.`,
          mentions: [remetente],
        });
      }, (120 - tempoAvisoAntesDoFim) * 60 * 1000);

      setTimeout(async () => {
        await sock.sendMessage(grupoId, {
          text: `✅ @${numero}, sua lavagem terminou!\n🧺 A máquina agora está livre.`,
          mentions: [remetente],
        });

        lavagemAtiva = null;

        if (filaDeEspera.length > 0) {
          const proximo = filaDeEspera.shift();
          await sock.sendMessage(grupoId, {
            text: `🚨 @${proximo.usuario}, chegou a sua vez de usar a máquina!`,
            mentions: [proximo.jid],
          });
        }
      }, 120 * 60 * 1000);

      return;
    }

    // ----------------------
    // Opção 4 - Finalizar Lavagem Manual
    if (texto === "4" || texto.includes("finalizar")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, { text: "ℹ️ Nenhuma lavagem está ativa no momento." });
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
      if (filaDeEspera.length > 0) filaDeEspera.shift();
      return;
    }

    // ----------------------
    // Opção 5 - Entrar na fila
    if (texto === "5" || texto.includes("entrar na fila")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, { text: "🟢 A máquina está disponível! Use a opção *3* para iniciar." });
        return;
      }

      if (filaDeEspera.find(p => p.jid === remetente)) {
        await sock.sendMessage(grupoId, { text: `ℹ️ Você já está na fila, @${numero}!`, mentions: [remetente] });
        return;
      }

      filaDeEspera.push({ usuario: numero, jid: remetente });
      await sock.sendMessage(grupoId, {
        text: `⏳ @${numero} entrou na fila!\n📊 Posição: ${filaDeEspera.length}º\n\n*Fila atual:*\n${filaDeEspera.map((p, i) => `${i + 1}. @${p.usuario}`).join("\n")}`,
        mentions: [remetente],
      });
      return;
    }

    // ----------------------
    // Opção 6 - Sair da fila
    if (texto === "6" || texto.includes("sair da fila")) {
      const index = filaDeEspera.findIndex(p => p.jid === remetente);
      if (index === -1) {
        await sock.sendMessage(grupoId, { text: "ℹ️ Você não está na fila." });
        return;
      }

      filaDeEspera.splice(index, 1);
      await sock.sendMessage(grupoId, { text: `🚶‍♂️ @${numero} saiu da fila!`, mentions: [remetente] });
      return;
    }

    // ----------------------
    // Opção 7 - Sortear roupas
    if (texto === "7" || texto.includes("sortear")) {
      const roupas = [
        "👕 Camiseta", "👖 Calça", "🧦 Meias", "👔 Camisa", "🩳 Shorts",
        "👗 Vestido", "🩱 Roupa íntima", "👚 Blusa", "👕 Regata", "👖 Legging",
        "🧤 Luvas", "🧣 Cachecol", "🩲 Cueca", "🩱 Sutiã", "🛏️ Lençol",
        "🛏️ Fronha", "🧺 Toalha de rosto", "🧼 Toalha de banho", "👕 Pijama"
      ];

      const sorteada = roupas[Math.floor(Math.random() * roupas.length)];

      await sock.sendMessage(grupoId, {
        text: `🎲 *SORTEIO DE ROUPAS*\n\n@${numero} tirou: ${sorteada}!\n\n😄 Boa sorte na lavagem!`,
        mentions: [remetente],
      });
      return;
    }

    // ----------------------
    // Opção 8 - Horário de funcionamento
    if (texto === "8" || texto.includes("horário") || texto.includes("horario")) {
      const horarios = `⏰ *HORÁRIO DE FUNCIONAMENTO*\n\n🗓️ Todos os dias: 07:00 - 20:00\n\n⚠️ *Aviso Importante:*\nA *última lavagem deve começar até as 20h* para que seja *finalizada até as 22h*, respeitando o horário de silêncio do condomínio. 🕊️\n\n🔕 Evite usar as máquinas após as 22h, em qualquer dia.`;
      await sock.sendMessage(grupoId, { text: horarios });
      return;
    }

    // ----------------------
    // Opção 9 - Previsão do tempo
    if (texto === "9" || texto.includes("previsão") || texto.includes("previsao") || texto.includes("tempo")) {
      try {
        const { data } = await axios.get("https://api.hgbrasil.com/weather?key=31f0dad0&city_name=Viamão,RS");
        const info = data.results;
        let dica = "🧺 Aproveite o dia para lavar suas roupas!";
        const condicao = info.description.toLowerCase();

        if (condicao.includes("chuva") || condicao.includes("tempestade")) dica = "🌧️ Vai chover! Evite estender roupas ao ar livre e use o varal interno.";
        else if (condicao.includes("nublado")) dica = "⛅ Dia nublado. Pode lavar, mas prefira secar em local coberto.";
        else if (condicao.includes("sol")) dica = "☀️ Sol forte! Ótimo dia para secar roupas rapidamente.";
        else if (condicao.includes("neblina")) dica = "🌫️ Neblina presente. O tempo úmido pode atrasar a secagem.";

        const mensagem = `🌦️ *PREVISÃO DO TEMPO - ${info.city}*  
📅 ${info.date}  
🌡️ Temperatura: ${info.temp}°C  
🌤️ Condição: ${info.description}  
💨 Vento: ${info.wind_speedy}  
💧 Umidade: ${info.humidity}%  
🌅 Nascer do Sol: ${info.sunrise}  
🌇 Pôr do Sol: ${info.sunset}  

💡 *Dica:* ${dica}

📍 *Atualizado automaticamente via HGBrasil API*`;

        await sock.sendMessage(grupoId, { text: mensagem });
      } catch (err) {
        console.error("❌ Erro ao obter previsão do tempo:", err.message);
        await sock.sendMessage(grupoId, { text: "⚠️ Não foi possível obter a previsão do tempo no momento. Tente novamente mais tarde." });
      }
      return;
    }

    // ----------------------
    // Opção 10 - Coleta de lixo
    if (texto === "10" || texto.includes("lixo") || texto.includes("coleta")) {
      const hoje = moment.tz("America/Sao_Paulo").format("dddd");
      const coleta = `🗑️ *COLETA DE LIXO*\n\n📅 Hoje é *${hoje}*\n\n♻️ *Lixo Reciclável:* Terça, Quinta e Sábado\n🗑️ *Lixo Orgânico e Comum:* Segunda, Quarta e Sexta\n\n⏰ *Horário:* Deixar o lixo até às 19h na área designada.\n\n🔹 *Orientações importantes:*\n- Separe o lixo *reciclável* do *orgânico*.\n- Mantenha uma *sacola separada apenas para recicláveis*.\n- Sempre *amarre bem as sacolas*.\n- Use preferencialmente:\n  🟦 *Sacos azuis* ou *sacolas brancas de supermercado* → para recicláveis\n  ⬛ *Sacos pretos* → para lixo comum e orgânico\n\n🚮 *Importante:*\nCaso os sacos de lixo estejam na *calçada*, o descarte será feito junto com os demais moradores,\npois a coleta ocorre *a cada 2 dias*. Dessa forma, evitamos acúmulo e mantemos o local limpo e organizado.\n\n💚 *Separar e descartar corretamente ajuda o meio ambiente e facilita o trabalho dos catadores!*`;

      await sock.sendMessage(grupoId, { text: coleta });
      return;
    }

  } catch (err) {
    console.error("❌ Erro ao processar mensagem da lavanderia:", err.message);
    await sock.sendMessage(msg.key.remoteJid, { text: "❌ Ocorreu um erro ao processar seu comando. Tente novamente." });
  }
}

module.exports = {
  tratarMensagemLavanderia,
  enviarBoasVindas,
};
