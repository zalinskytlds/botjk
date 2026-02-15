import fs from "fs-extra";
import path from "path";
import moment from "moment-timezone";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARQUIVO = path.join(__dirname, "lavanderia.json");
const TIMEZONE = "America/Sao_Paulo";

// Estado inicial
let estado = {
  emUso: false,
  usuarioAtual: null,
  inicio: null,
  fila: [],
};

// Carrega estado do arquivo
if (fs.existsSync(ARQUIVO)) {
  estado = fs.readJsonSync(ARQUIVO);
}

// Salva estado no arquivo
function salvar() {
  fs.writeJsonSync(ARQUIVO, estado, { spaces: 2 });
}

// Pega texto da mensagem com fallback seguro
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
  console.log("📤 Enviando menu para:", grupoId);
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
// 🔹 FLUXO PRINCIPAL
// ===============================
async function fluxoLavanderia(sock, msg, grupoId) {
  const texto = obterTexto(msg);
  const remetente = msg.key?.participant || msg.key?.remoteJid || "usuário";

  try {
    switch (texto) {
      case "menu":
      case "!ajuda":
        return enviarMenu(sock, grupoId);

      case "1":
        return sock.sendMessage(grupoId, "🧼 Separe roupas e não exceda 8kg.");

      case "2":
        return sock.sendMessage(grupoId, "⚙️ Lavadora 11kg • Tempo médio: 50min");

      case "3":
        if (estado.emUso) {
          return sock.sendMessage(
            grupoId,
            `⛔ Em uso por @${estado.usuarioAtual?.split("@")[0] || "desconhecido"}`
          );
        }
        estado.emUso = true;
        estado.usuarioAtual = remetente;
        estado.inicio = moment().tz(TIMEZONE).format();
        salvar();
        return sock.sendMessage(
          grupoId,
          `🚿 Lavagem iniciada por @${remetente.split("@")[0]}`
        );

      case "4":
        estado.emUso = false;
        estado.usuarioAtual = null;
        estado.inicio = null;
        salvar();
        return sock.sendMessage(grupoId, "✅ Lavagem finalizada!");

      case "5":
        if (!estado.fila.includes(remetente)) estado.fila.push(remetente);
        salvar();
        return sock.sendMessage(grupoId, `⏳ Você entrou na fila (${estado.fila.length})`);

      case "6":
        estado.fila = estado.fila.filter((u) => u !== remetente);
        salvar();
        return sock.sendMessage(grupoId, "🚶‍♂️ Você saiu da fila.");

      case "7":
        if (!estado.fila.length) return sock.sendMessage(grupoId, "🎲 Fila vazia.");
        return sock.sendMessage(grupoId, `🎲 Sorteado: @${estado.fila[0].split("@")[0]}`);

      case "8":
        return sock.sendMessage(grupoId, "⏰ Funcionamento: 07h às 23h");

      case "9":
        return sock.sendMessage(grupoId, "🌦️ Consulte a previsão no Climatempo.");

      case "10":
        return sock.sendMessage(grupoId, "🗑️ Coleta: Seg, Qua e Sex à noite.");

      default:
        console.log("ℹ️ Mensagem não reconhecida:", texto);
        return; // Não envia nada
    }
  } catch (err) {
    console.error("❌ Erro no fluxoLavanderia:", err);
  }
}

// ===============================
// ✅ EXPORTS
// ===============================
export async function tratarMensagemLavanderia(sock, msg, grupoId) {
  return fluxoLavanderia(sock, msg, grupoId);
}

// export exigido pelo index.js (mesmo que vazio)
export async function tratarEntradaSaidaGrupo() {
  return;
}
