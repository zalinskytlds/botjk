const axios = require("axios");

// 🌐 URLs do Google Apps Script
const URL_SHEETDB_ENCOMENDAS =
  process.env.SHEETDB_ENCOMENDAS ||
  "https://script.google.com/macros/s/AKfycbzBKHN0yIkO85Kh3QxkjGsSUzpmBjs2fqmovZoUPWMDUrjRl5uTE3UtXX6zcLmyktX3Jw/exec";

const URL_SHEETDB_HISTORICO =
  process.env.SHEETDB_HISTORICO ||
  "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";

const URL_SHEETDB_LOG =
  process.env.SHEETDB_LOG ||
  "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// 🧠 Controle de sessões e tempo de expiração
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// Expira sessões antigas
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// 📦 Função principal
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = msg.message.conversation?.trim().toLowerCase() || "";
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const usuario = msg.pushName || "Desconhecido";
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    // --- LOG do usuário ---
    if (!msg.key.fromMe && textoUsuario) {
      try {
        await axios.post(URL_SHEETDB_LOG, [
          { usuario, mensagem: textoUsuario, origem: "usuário", dataHora },
        ]);
      } catch (err) {
        console.error("Erro ao salvar log do usuário:", err.message);
      }
    }

    // --- Função auxiliar para enviar mensagens e registrar log ---
    const enviar = async (mensagem) => {
      const conteudo = typeof mensagem === "string" ? { text: mensagem } : mensagem;
      await sock.sendMessage(remetente, conteudo);

      try {
        await axios.post(URL_SHEETDB_LOG, [
          { usuario: "BOT", mensagem: conteudo.text || JSON.stringify(conteudo), origem: "bot", dataHora },
        ]);
      } catch (err) {
        console.error("Erro ao salvar log do BOT:", err.message);
      }
    };

    // --- Tratamento inicial ---
    const escolha = parseInt(textoUsuario, 10);
    const sessaoAtiva = estadosUsuarios[idSessao];

    // 🆕 Novo comportamento: usuário digita "0"
    if (textoUsuario === "0") {
      await enviar(
        "⚙️ A forma de acessar o módulo de encomendas mudou!\n\n" +
        "Agora, para abrir o menu, digite: *menu*\n\n" +
        "Exemplo:\n> menu"
      );
      return;
    }

    // 🆕 Comando para abrir menu
    if (textoUsuario === "menu") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar("🔐 Módulo de encomendas iniciado...");
      await enviar(
        "Escolha uma opção:\n\n" +
        "1️⃣ Registrar Encomenda\n" +
        "2️⃣ Ver Todas as Encomendas\n" +
        "3️⃣ Confirmar Recebimento (via ID)\n" +
        "4️⃣ Ver Histórico de Encomendas"
      );
      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    // Bloqueia se o usuário tentar pular etapas
    if (!sessaoAtiva) return;
    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    // --- Lógica das etapas ---
    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);

          if (!Array.isArray(data) || !data.length) {
            await enviar("📭 Nenhuma encomenda registrada ainda.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const agrupado = {};
          data.forEach((e) => {
            const nome = e.nome?.toLowerCase().trim() || "desconhecido";
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          });

          let resposta = "📦 *Encomendas registradas:*\n\n";
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            resposta += `👤 ${nome}\n`;
            encomendas.forEach((e) => {
              resposta += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n📍 Status: ${e.status}`;
              if (e.recebido_por) resposta += `\n📬 Recebido por: ${e.recebido_por}`;
              resposta += "\n\n";
            });
          }

          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviar("📦 Informe o *ID da encomenda* que deseja confirmar:");
        } else if (escolha === 4) {
          const { data: historicoBruto } = await axios.get(URL_SHEETDB_HISTORICO);
          const historico = Array.isArray(historicoBruto)
            ? historicoBruto
            : historicoBruto?.data || historicoBruto?.records || [];

          if (!historico.length) {
            await enviar("📭 O histórico está vazio.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const blocos = [];
          for (let i = 0; i < historico.length; i += 5) blocos.push(historico.slice(i, i + 5));

          for (const bloco of blocos) {
            let msgHist = "📜 *Histórico de Encomendas:*\n\n";
            bloco.forEach((e) => {
              msgHist += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n👤 ${e.nome}\n📍 Status: ${e.status}`;
              if (e.recebido_por) msgHist += `\n📬 Recebido por: ${e.recebido_por}`;
              msgHist += "\n\n";
            });
            await enviar(msgHist.trim());
          }

          delete estadosUsuarios[idSessao];
        } else {
          await enviar("⚠️ Opção inválida. Escolha entre 1, 2, 3 ou 4.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada de entrega? (Ex: 25/10/2025)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
        if (partes.length !== 3) return await enviar("❌ Formato inválido. Use dia/mês/ano.");

        let [dia, mes, ano] = partes.map((p) => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        const dataObj = new Date(ano, mes - 1, dia);
        if (dataObj.getDate() !== dia || dataObj.getMonth() !== mes - 1) {
          return await enviar("❌ Data inválida. Tente novamente.");
        }

        estado.data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
        estado.etapa = "obterLocal";
        await enviar("🏬 Onde a compra foi realizada? (Ex: Shopee, Mercado Livre)");
        break;
      }

      case "obterLocal": {
        estado.local = textoUsuario;
        const { data: todas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const ids = (Array.isArray(todas) ? todas : []).map((e) => parseInt(e.id, 10)).filter((i) => !isNaN(i));
        const proximoId = (Math.max(0, ...ids) + 1).toString();

        await axios.post(URL_SHEETDB_ENCOMENDAS, [
          {
            id: proximoId,
            nome: estado.nome,
            data: estado.data,
            local: estado.local,
            status: "Aguardando Recebimento",
          },
        ]);

        await enviar(
          `✅ *Encomenda registrada com sucesso!*\n\n` +
          `🧾 ID: ${proximoId}\n👤 Nome: ${estado.nome}\n🗓️ Chegada: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      case "informarID": {
        estado.idConfirmar = textoUsuario;
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = data.find((e) => e.id === estado.idConfirmar);

        if (!encomenda || encomenda.status !== "Aguardando Recebimento") {
          await enviar("❌ ID inválido ou encomenda já recebida.\nDigite *menu* e consulte pela opção 2.");
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.encomendaSelecionada = encomenda;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/id/${enc.id}`, {
          status: "Recebida",
          recebido_por: recebidoPor,
        });

        await enviar(
          `📬 *Recebimento confirmado!*\n\n` +
          `🆔 ${enc.id}\n👤 ${enc.nome}\n🛒 ${enc.local}\n📅 ${enc.data}\n📬 Recebido por: ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviar("⚠️ Algo deu errado. Digite *menu* para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
