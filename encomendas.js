const axios = require("axios");
const moment = require("moment-timezone");

// URLs da SheetDB
const URL_SHEETDB_ENCOMENDAS = process.env.SHEETDB_ENCOMENDAS || "https://script.google.com/macros/s/AKfycbyd_nqucooE5FKDQvvLP0IPjD8ndv8IEZV_fZkXb2xQk-xt6cw0xj0Fj0KdlHilvVUl/exec";
const URL_SHEETDB_HISTORICO = process.env.SHEETDB_HISTORICO || "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";
const URL_SHEETDB_LOG = process.env.SHEETDB_LOG || "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// Controle de sessões e timeout
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// Inicia/renova timeout da sessão
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// Função para enviar mensagem e logar no SheetDB
async function enviarMensagem(sock, destinatario, mensagem) {
  const conteudo = typeof mensagem === "string" ? { text: mensagem } : mensagem;
  await sock.sendMessage(destinatario, conteudo);

  try {
    await axios.post(URL_SHEETDB_LOG, [
      {
        usuario: "BOT",
        mensagem: conteudo.text || JSON.stringify(conteudo),
        origem: "bot",
        dataHora: moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss")
      }
    ]);
  } catch (err) {
    console.error("Erro ao salvar log do BOT:", err.message);
  }
}

// Função para exibir menu principal
async function exibirMenu(sock, destinatario) {
  const menuMensagem = `
📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*

1️⃣ Registrar Encomenda 📦
2️⃣ Ver Encomendas 📋
3️⃣ Confirmar Retirada ✅
4️⃣ Ver Histórico 🕓

Digite o número da opção desejada ou use os comandos:
• *!ping* - Verificar status do bot
• *!ajuda* ou *menu* - Ver este menu
• *!info* - Informações do grupo
`;
  await enviarMensagem(sock, destinatario, menuMensagem);
}

// Função principal para tratar mensagens
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const usuario = msg.pushName || "Desconhecido";
    const dataHora = moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss");

    // Log da mensagem do usuário
    if (!msg.key.fromMe && textoUsuario) {
      try {
        await axios.post(URL_SHEETDB_LOG, [
          { usuario, mensagem: textoUsuario, origem: "usuário", dataHora }
        ]);
      } catch (err) {
        console.error("Erro ao salvar log do usuário:", err.message);
      }
    }

    // Comando 0: explica que o menu mudou
    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviarMensagem(sock, remetente, "⚙️ A forma de acessar o módulo de encomendas mudou!\nAgora digite: *menu*");
      return;
    }

    // Só continua se houver sessão ativa ou se for menu
    const sessaoAtiva = estadosUsuarios[idSessao];
    if (!sessaoAtiva && !["menu", "!ajuda"].includes(textoUsuario.toLowerCase())) return;

    iniciarTimeout(idSessao);

    // Abrir menu
    if (textoUsuario.toLowerCase() === "menu" || textoUsuario.toLowerCase() === "!ajuda") {
      estadosUsuarios[idSessao] = { etapa: "aguardandoEscolha" };
      await exibirMenu(sock, remetente);
      return;
    }

    const estado = estadosUsuarios[idSessao];
    const escolha = parseInt(textoUsuario, 10);

    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviarMensagem(sock, remetente, "Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          if (!data.length) return await enviarMensagem(sock, remetente, "📭 Nenhuma encomenda registrada ainda.");

          // Agrupa por nome
          const agrupado = {};
          data.forEach(e => {
            const nome = (e.nome || "Desconhecido").toLowerCase();
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          });

          let listaMensagem = "📦 *Encomendas registradas:*\n\n";
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            listaMensagem += `👤 ${nome}\n`;
            encomendas.forEach(enc => {
              const dataFormatada = moment(enc.data).tz("America/Sao_Paulo").format("DD/MM/YYYY");
              listaMensagem += `🆔 ${enc.id} 🛒 ${enc.local} — ${dataFormatada}\n📍 Status: ${enc.status}`;
              if (enc.recebido_por) listaMensagem += `\n📬 Recebido por: ${enc.recebido_por}`;
              listaMensagem += "\n\n";
            });
          }

          await enviarMensagem(sock, remetente, listaMensagem.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviarMensagem(sock, remetente, "📦 Qual o ID da encomenda que deseja confirmar?");
        } else if (escolha === 4) {
          const { data: historico } = await axios.get(URL_SHEETDB_HISTORICO);
          if (!historico.length) return await enviarMensagem(sock, remetente, "📭 Nenhum registro no histórico.");

          const blocos = [];
          for (let i = 0; i < historico.length; i += 5) blocos.push(historico.slice(i, i + 5));

          for (const bloco of blocos) {
            let msgHist = "📜 Histórico de Encomendas:\n\n";
            bloco.forEach(e => {
              const dataRegistro = moment(e.dataRegistro || e.dataHora).tz("America/Sao_Paulo").format("DD/MM/YYYY");
              const dataRetirada = e.dataRetirada ? moment(e.dataRetirada).tz("America/Sao_Paulo").format("DD/MM/YYYY") : "N/A";
              msgHist += `🆔 ${e.id} 🛒 ${e.local} — ${dataRegistro}\n👤 ${e.usuario}\n📍 Status: ${e.status}\n✅ Retirada: ${dataRetirada}`;
              if (e.recebido_por) msgHist += `\n📬 Recebido por: ${e.recebido_por}`;
              msgHist += "\n\n";
            });
            await enviarMensagem(sock, remetente, msgHist.trim());
          }
          delete estadosUsuarios[idSessao];
        } else {
          await enviarMensagem(sock, remetente, "Opção inválida. Por favor, escolha 1, 2, 3 ou 4.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviarMensagem(sock, remetente, "Qual a data estimada de entrega? (Ex: dia/mês/ano)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
        if (partes.length !== 3) return await enviarMensagem(sock, remetente, "Formato inválido. Use dia/mês/ano.");
        let [dia, mes, ano] = partes.map(p => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        estado.data = `${String(dia).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
        estado.etapa = "obterLocal";
        await enviarMensagem(sock, remetente, "Onde a compra foi realizada? (Ex: Shopee, Mercado Livre)");
        break;
      }

      case "obterLocal": {
        estado.local = textoUsuario;
        const { data: todas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const ids = todas.map(e => parseInt(e.id, 10)).filter(i => !isNaN(i));
        const proximoId = (Math.max(0, ...ids) + 1).toString();

        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          id: proximoId,
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento"
        }]);

        await enviarMensagem(sock, remetente, `✅ Encomenda registrada para ${estado.nome}!\n🆔 ID: ${proximoId}\n🗓️ Chegada em: ${estado.data}\n🛒 Loja: ${estado.local}`);
        delete estadosUsuarios[idSessao];
        break;
      }

      case "informarID": {
        estado.idConfirmar = textoUsuario;
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = data.find(e => e.id === estado.idConfirmar);
        if (!encomenda || encomenda.status !== "Aguardando Recebimento") {
          await enviarMensagem(sock, remetente, "❌ ID inválido ou encomenda já recebida. Digite 0 para retornar ao menu.");
          delete estadosUsuarios[idSessao];
          return;
        }
        estado.encomendaSelecionada = encomenda;
        estado.etapa = "confirmarRecebedor";
        await enviarMensagem(sock, remetente, "✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/id/${enc.id}`, {
          status: "Recebida",
          recebido_por: recebidoPor
        });

        await enviarMensagem(sock, remetente, `✅ Recebimento registrado!\n📦 ${enc.nome} — ${enc.local} em ${enc.data}\n📬 Recebido por: ${recebidoPor}`);
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviarMensagem(sock, remetente, "Algo deu errado. Envie '0' para recomeçar.");
        delete estadosUsuarios[idSessao];
    }

  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
