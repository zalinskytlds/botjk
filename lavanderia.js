const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

const ARQUIVO = path.join(__dirname, "lavanderia.json");
const TIMEZONE = "America/Sao_Paulo";
const TEMPO_LAVAGEM_MIN = 50;

/* =========================
   🔹 PERSISTÊNCIA
========================= */
let estado = {
  emUso: false,
  usuarioAtual: null,
  inicio: null,
  fila: [],
};

if (fs.existsSync(ARQUIVO)) {
  estado = fs.readJsonSync(ARQUIVO);
}

function salvar() {
  fs.writeJsonSync(ARQUIVO, estado, { spaces: 2 });
}

/* =========================
   🔹 MENU TEXTO (fallback)
========================= */
function obterMenuLavanderia() {
  return `
🧺 *Lavanderia – JK Universitário*

1️⃣ Dicas de uso
2️⃣ Informações da lavadora
3️⃣ Iniciar lavagem
4️⃣ Finalizar lavagem
5️⃣ Entrar na fila
6️⃣ Sair da fila
7️⃣ Sortear roupas (até 8kg)
8️⃣ Horário de funcionamento
9️⃣ Previsão do tempo
🔟 Coleta de lixo

Digite o número ou use o menu 📋
`;
}

/* =========================
   🔹 MENU EM LISTA (UX PRO)
========================= */
async function enviarMenuLavanderiaLista(sock, grupoId) {
  await sock.sendMessage(grupoId, {
    text: "🧺 *Lavanderia – JK Universitário*\nSelecione uma opção:",
    footer: "Ou digite o número correspondente",
    buttonText: "📋 Abrir Menu",
    sections: [
      {
        title: "🧺 Lavanderia",
        rows: [
          { title: "Dicas de uso 🧼", rowId: "1" },
          { title: "Info Lavadora ⚙️", rowId: "2" },
          { title: "Iniciar Lavagem 🚿", rowId: "3" },
          { title: "Finalizar Lavagem ✅", rowId: "4" },
          { title: "Entrar na Fila ⏳", rowId: "5" },
          { title: "Sair da Fila 🚶‍♂️", rowId: "6" },
        ],
      },
      {
        title: "ℹ️ Utilidades",
        rows: [
          { title: "Sortear Roupas 🎲", rowId: "7" },
          { title: "Horário de Funcionamento ⏰", rowId: "8" },
          { title: "Previsão do Tempo 🌦️", rowId: "9" },
          { title: "Coleta de Lixo 🗑️", rowId: "10" },
        ],
      },
    ],
  });
}

/* =========================
   🔹 FUNÇÃO PRINCIPAL
========================= */
async function tratarMensagemLavanderia(sock, msg, grupoId) {
  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  )
    .trim()
    .toLowerCase();

  const remetente = msg.key.participant || msg.key.remoteJid;

  /* MENU */
  if (texto === "menu" || texto === "!ajuda") {
    await enviarMenuLavanderiaLista(sock, grupoId);
    await sock.sendMessage(grupoId, { text: obterMenuLavanderia() });
    return;
  }

  if (texto === "1") {
    await sock.sendMessage(grupoId, {
      text: "🧼 Separe roupas, não exceda 8kg e use sabão líquido.",
    });
    return;
  }

  if (texto === "2") {
    await sock.sendMessage(grupoId, {
      text: "⚙️ Lavadora 11kg • Uso coletivo • Tempo médio: 50 min",
    });
    return;
  }

  if (texto === "3") {
    if (estado.emUso) {
      await sock.sendMessage(grupoId, {
        text: `⛔ Máquina em uso por @${estado.usuarioAtual.split("@")[0]}`,
        mentions: [estado.usuarioAtual],
      });
      return;
    }

    estado.emUso = true;
    estado.usuarioAtual = remetente;
    estado.inicio = moment().tz(TIMEZONE).format();
    salvar();

    await sock.sendMessage(grupoId, {
      text: `🚿 Lavagem iniciada por @${remetente.split("@")[0]}`,
      mentions: [remetente],
    });
    return;
  }

  if (texto === "4") {
    if (!estado.emUso) {
      await sock.sendMessage(grupoId, { text: "ℹ️ Nenhuma lavagem ativa." });
      return;
    }

    if (estado.usuarioAtual !== remetente) {
      await sock.sendMessage(grupoId, {
        text: "⛔ Apenas quem iniciou pode finalizar.",
      });
      return;
    }

    estado.emUso = false;
    estado.usuarioAtual = null;
    estado.inicio = null;
    salvar();

    await sock.sendMessage(grupoId, {
      text: "✅ Lavagem finalizada com sucesso!",
    });
    return;
  }

  if (texto === "5") {
    if (!estado.fila.includes(remetente)) {
      estado.fila.push(remetente);
      salvar();
    }

    await sock.sendMessage(grupoId, {
      text: `⏳ Você entrou na fila. Posição: ${
        estado.fila.indexOf(remetente) + 1
      }`,
    });
    return;
  }

  if (texto === "6") {
    estado.fila = estado.fila.filter((u) => u !== remetente);
    salvar();
    await sock.sendMessage(grupoId, { text: "🚶‍♂️ Você saiu da fila." });
    return;
  }

  if (texto === "7") {
    const pessoas = estado.fila.slice(0, 3);
    if (pessoas.length === 0) {
      await sock.sendMessage(grupoId, { text: "🎲 Fila vazia." });
      return;
    }

    await sock.sendMessage(grupoId, {
      text: `🧺 Lavagem sorteada:\n${pessoas
        .map((p) => `• @${p.split("@")[0]}`)
        .join("\n")}`,
      mentions: pessoas,
    });
    return;
  }

  if (texto === "8") {
    await sock.sendMessage(grupoId, {
      text: "⏰ Lavanderia disponível diariamente das 07h às 23h.",
    });
    return;
  }

  if (texto === "9") {
    await sock.sendMessage(grupoId, {
      text: "🌦️ Consulte a previsão local pelo app Climatempo.",
    });
    return;
  }

  if (texto === "10") {
    await sock.sendMessage(grupoId, {
      text: "🗑️ Coleta: Segunda, Quarta e Sexta à noite.",
    });
  }
}

/* =========================
   🔹 BOAS-VINDAS / SAÍDA
========================= */
async function tratarEntradaSaidaGrupo(sock) {
  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update;

    for (const user of participants) {
      const nome = user.split("@")[0];

      if (action === "add") {
        await sock.sendMessage(id, {
          text: `👋 Bem-vindo(a) @${nome}!\n\n🧺 Digite *menu* para usar a lavanderia.`,
          mentions: [user],
        });
      }

      if (action === "remove") {
        await sock.sendMessage(id, {
          text: `👋 @${nome} saiu do grupo.\nDesejamos boa sorte!`,
          mentions: [user],
        });
      }
    }
  });
}

exports = {
  tratarMensagemLavanderia,
  tratarEntradaSaidaGrupo,
};
