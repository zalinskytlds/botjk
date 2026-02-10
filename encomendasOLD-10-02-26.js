import axios from "axios";
import moment from "moment-timezone";

// ================== CONFIG ==================
const URL_SHEETDB_ENCOMENDAS =
  process.env.SHEETDB_ENCOMENDAS ||
  "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";

const URL_SHEETDB_HISTORICO =
  process.env.SHEETDB_HISTORICO ||
  "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";

const URL_SHEETDB_LOG =
  process.env.SHEETDB_LOG ||
  "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// ================== SESSÃO ==================
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

function iniciarTimeout(id) {
  if (timeoutUsuarios[id]) clearTimeout(timeoutUsuarios[id]);
  timeoutUsuarios[id] = setTimeout(() => {
    delete estadosUsuarios[id];
    delete timeoutUsuarios[id];
  }, TEMPO_EXPIRACAO_MS);
}

// ================== UTIL ==================
async function enviarMensagem(sock, para, conteudo) {
  const msg = typeof conteudo === "string" ? { text: conteudo } : conteudo;
  await sock.sendMessage(para, msg);

  try {
    await axios.post(URL_SHEETDB_LOG, [
      {
        usuario: "BOT",
        mensagem: msg.text || JSON.stringify(msg),
        origem: "bot",
        dataHora: moment()
          .tz("America/Sao_Paulo")
          .format("DD/MM/YYYY HH:mm:ss"),
      },
    ]);
  } catch {}
}

// ================== MENU LISTA ==================
async function enviarMenuLista(sock, para) {
  await sock.sendMessage(para, {
    text: "📦 *Encomendas – JK Universitário*\nSelecione uma opção:",
    footer: "Ou digite o número desejado",
    buttonText: "📋 Abrir Menu",
    sections: [
      {
        title: "📦 Encomendas",
        rows: [
          { title: "Registrar Encomenda 📦", rowId: "1" },
          { title: "Ver Encomendas 📋", rowId: "2" },
          { title: "Confirmar Retirada ✅", rowId: "3" },
          { title: "Ver Histórico 🕓", rowId: "4" },
        ],
      },
      {
        title: "ℹ️ Sistema",
        rows: [
          { title: "Ajuda / Menu", rowId: "menu" },
          { title: "Ping do Bot", rowId: "!ping" },
        ],
      },
    ],
  });
}

// ================== MENU TEXTO (fallback) ==================
function menuTexto() {
  return `
📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*

1️⃣ Registrar Encomenda
2️⃣ Ver Encomendas
3️⃣ Confirmar Retirada
4️⃣ Ver Histórico

Digite o número ou escreva *menu*
`;
}

// ================== MAIN ==================
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";

    const textoUsuario = texto.trim().toLowerCase();
    const idSessao = remetente + (msg.key.participant || "");
    const usuario = msg.pushName || "Usuário";

    if (!textoUsuario) return;

    iniciarTimeout(idSessao);

    // ===== MENU =====
    if (["menu", "!ajuda"].includes(textoUsuario)) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      await enviarMenuLista(sock, remetente);
      await enviarMensagem(sock, remetente, menuTexto());
      return;
    }

    const estado = estadosUsuarios[idSessao] || { etapa: "menu" };
    estadosUsuarios[idSessao] = estado;

    // ===== ESCOLHA =====
    if (estado.etapa === "menu") {
      const escolha = parseInt(textoUsuario, 10);

      if (escolha === 1) {
        estado.etapa = "obterNome";
        return enviarMensagem(
          sock,
          remetente,
          "👤 Qual o nome do destinatário?"
        );
      }

      if (escolha === 2) {
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        if (!data.length)
          return enviarMensagem(sock, remetente, "📭 Nenhuma encomenda.");

        let msgLista = "📦 *Encomendas registradas:*\n\n";
        data.forEach((e) => {
          msgLista += `🆔 ${e.ID} — ${e.nome}\n📍 ${e.local} | ${e.status}\n\n`;
        });

        delete estadosUsuarios[idSessao];
        return enviarMensagem(sock, remetente, msgLista.trim());
      }

      if (escolha === 3) {
        estado.etapa = "informarID";
        return enviarMensagem(sock, remetente, "🆔 Informe o ID da encomenda:");
      }

      if (escolha === 4) {
        const { data } = await axios.get(URL_SHEETDB_HISTORICO);
        if (!data.length)
          return enviarMensagem(sock, remetente, "📭 Histórico vazio.");

        let hist = "📜 *Histórico*\n\n";
        data.slice(0, 10).forEach((e) => {
          hist += `🆔 ${e.ID} — ${e.usuario}\n📍 ${e.status}\n\n`;
        });

        delete estadosUsuarios[idSessao];
        return enviarMensagem(sock, remetente, hist.trim());
      }

      return enviarMensagem(sock, remetente, "❌ Opção inválida.");
    }

    // ===== CONFIRMAR ID =====
    if (estado.etapa === "informarID") {
      const id = parseInt(textoUsuario, 10);
      if (isNaN(id)) return enviarMensagem(sock, remetente, "❌ ID inválido.");

      const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
      const enc = data.find((e) => parseInt(e.ID) === id);

      if (!enc)
        return enviarMensagem(sock, remetente, "❌ Encomenda não encontrada.");

      estado.encomenda = enc;
      estado.etapa = "confirmarRecebedor";

      return enviarMensagem(
        sock,
        remetente,
        `📦 ${enc.nome} — ${enc.local}\n✋ Quem está recebendo?`
      );
    }

    // ===== CONFIRMAR RECEBEDOR =====
    if (estado.etapa === "confirmarRecebedor") {
      const recebidoPor = textoUsuario;

      await axios.post(URL_SHEETDB_ENCOMENDAS, {
        acao: "atualizar",
        id: estado.encomenda.ID,
        status: "Recebida",
        recebido_por: recebidoPor,
      });

      delete estadosUsuarios[idSessao];

      return enviarMensagem(
        sock,
        remetente,
        `✅ Encomenda confirmada!\n📬 Recebido por: ${recebidoPor}`
      );
    }
  } catch (e) {
    console.error("Erro Encomendas:", e);
  }
}

/* =========================
   🔹 BOAS-VINDAS / SAÍDA
========================= */
async function tratarEntradaSaidaEncomendas(sock) {
  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update;

    for (const user of participants) {
      const nome = user.split("@")[0];

      if (action === "add") {
        await sock.sendMessage(id, {
          text: `👋 Bem-vindo(a) @${nome}!\n\n📦 Digite *menu* para acessar o sistema de encomendas.`,
          mentions: [user],
        });
      }

      if (action === "remove") {
        await sock.sendMessage(id, {
          text: `👋 @${nome} saiu do grupo.\nObrigado por utilizar o sistema de encomendas.`,
          mentions: [user],
        });
      }
    }
  });
}

/* =========================
   🔹 EXPORTS (ES MODULES)
========================= */
export {
  tratarMensagemEncomendas,
  tratarEntradaSaidaEncomendas,
};
