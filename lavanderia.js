import fs from "fs-extra";
import path from "path";
import moment from "moment-timezone";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARQUIVO = path.join(__dirname, "lavanderia.json");
const TIMEZONE = "America/Sao_Paulo";

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

function obterTexto(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  )
    .trim()
    .toLowerCase();
}

// ===============================
// 📋 MENU
// ===============================
async function enviarMenu(sock, grupoId) {
  await sock.sendMessage(grupoId, {
    text: "🧺 *Lavanderia – JK Universitário*",
    footer: "Selecione uma opção",
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
          { title: "Horário ⏰", rowId: "8" },
          { title: "Previsão do Tempo 🌦️", rowId: "9" },
          { title: "Coleta de Lixo 🗑️", rowId: "10" },
        ],
      },
    ],
  });
}

// ===============================
// 🔹 MAIN
// ===============================
async function fluxoLavanderia(sock, msg, grupoId) {
  const texto = obterTexto(msg);
  const remetente = msg.key.participant || msg.key.remoteJid;

  if (texto === "menu" || texto === "!ajuda") {
    return enviarMenu(sock, grupoId);
  }

  if (texto === "1")
    return sock.sendMessage(grupoId, "🧼 Separe roupas e não exceda 8kg.");

  if (texto === "2")
    return sock.sendMessage(
      grupoId,
      "⚙️ Lavadora 11kg • Tempo médio: 50min"
    );

  if (texto === "3") {
    if (estado.emUso)
      return sock.sendMessage(
        grupoId,
        `⛔ Em uso por @${estado.usuarioAtual.split("@")[0]}`
      );

    estado.emUso = true;
    estado.usuarioAtual = remetente;
    estado.inicio = moment().tz(TIMEZONE).format();
    salvar();

    return sock.sendMessage(
      grupoId,
      `🚿 Lavagem iniciada por @${remetente.split("@")[0]}`
    );
  }

  if (texto === "4") {
    estado.emUso = false;
    estado.usuarioAtual = null;
    estado.inicio = null;
    salvar();
    return sock.sendMessage(grupoId, "✅ Lavagem finalizada!");
  }

  if (texto === "5") {
    if (!estado.fila.includes(remetente)) estado.fila.push(remetente);
    salvar();
    return sock.sendMessage(
      grupoId,
      `⏳ Você entrou na fila (${estado.fila.length})`
    );
  }

  if (texto === "6") {
    estado.fila = estado.fila.filter((u) => u !== remetente);
    salvar();
    return sock.sendMessage(grupoId, "🚶‍♂️ Você saiu da fila.");
  }

  if (texto === "7") {
    if (!estado.fila.length)
      return sock.sendMessage(grupoId, "🎲 Fila vazia.");
    return sock.sendMessage(
      grupoId,
      `🎲 Sorteado: @${estado.fila[0].split("@")[0]}`
    );
  }

  if (texto === "8")
    return sock.sendMessage(
      grupoId,
      "⏰ Funcionamento: 07h às 23h"
    );

  if (texto === "9")
    return sock.sendMessage(
      grupoId,
      "🌦️ Consulte a previsão no Climatempo."
    );

  if (texto === "10")
    return sock.sendMessage(
      grupoId,
      "🗑️ Coleta: Seg, Qua e Sex à noite."
    );
}

// ===============================
// ✅ EXPORTS COMPATÍVEIS COM INDEX
// ===============================
export async function tratarMensagemLavanderia(sock, msg, grupoId) {
  return fluxoLavanderia(sock, msg, grupoId);
}

// export exigido pelo index.js (mesmo que vazio)
export async function tratarEntradaSaidaGrupo() {
  return;
}
