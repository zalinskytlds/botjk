import axios from "axios";
import moment from "moment-timezone";

// ================== CONFIG ==================
// Use uma única URL de Script do Google e controle as abas por lá, ou URLs diferentes se preferir
const URL_GOOGLE_ENCOMENDAS = process.env.URL_GOOGLE_ENCOMENDAS || "https://script.google.com/macros/s/LINK_DA_PLANILHA_ENCOMENDAS/exec";

const TIMEZONE = "America/Sao_Paulo";
const estadosUsuarios = {};
const timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// ================== UTIL ==================
function iniciarTimeout(id) {
  if (timeoutUsuarios[id]) clearTimeout(timeoutUsuarios[id]);
  timeoutUsuarios[id] = setTimeout(() => {
    delete estadosUsuarios[id];
    delete timeoutUsuarios[id];
  }, TEMPO_EXPIRACAO_MS);
}

function extrairTexto(msg) {
  return (msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || "").trim().toLowerCase();
}

// ================== MENU ==================
function menuTexto() {
  return `📦 *ENCOMENDAS - JK UNIVERSITÁRIO*\n\n1️⃣ Registrar Encomenda\n2️⃣ Ver Encomendas Ativas\n3️⃣ Confirmar Retirada\n4️⃣ Ver Histórico\n\n👉 _Digite o número da opção ou *menu* para voltar._`;
}

// ================== FLUXO PRINCIPAL ==================
export async function tratarMensagemEncomendas(sock, msg) {
  const remetente = msg.key.remoteJid;
  const textoUsuario = extrairTexto(msg);
  if (!textoUsuario) return;

  const idSessao = msg.key.participant || remetente;
  iniciarTimeout(idSessao);

  // Comando de Reset/Menu
  if (["menu", "ajuda", "oi"].includes(textoUsuario)) {
    estadosUsuarios[idSessao] = { etapa: "menu" };
    return sock.sendMessage(remetente, { text: menuTexto() });
  }

  const estado = estadosUsuarios[idSessao] || { etapa: "menu" };

  try {
    // --- ETAPA: MENU PRINCIPAL ---
    if (estado.etapa === "menu") {
      switch (textoUsuario) {
        case "1":
          estado.etapa = "esperandoNome";
          estadosUsuarios[idSessao] = estado;
          return sock.sendMessage(remetente, { text: "👤 *Registrar:* Qual o nome do destinatário (Morador)?" });

        case "2":
          const { data: lista } = await axios.get(URL_GOOGLE_ENCOMENDAS);
          const ativas = lista.filter(e => e.status === "pendente");
          if (!ativas.length) return sock.sendMessage(remetente, { text: "📭 Nenhuma encomenda pendente no momento." });
          
          let txtLista = "📋 *Encomendas na Portaria:*\n\n";
          ativas.forEach(e => txtLista += `🆔 *${e.ID}* - ${e.nome}\n`);
          return sock.sendMessage(remetente, { text: txtLista });

        case "3":
          estado.etapa = "esperandoIDRetirada";
          estadosUsuarios[idSessao] = estado;
          return sock.sendMessage(remetente, { text: "🆔 Informe o *ID* da encomenda que está sendo retirada:" });

        case "4":
          const { data: historico } = await axios.get(URL_GOOGLE_ENCOMENDAS);
          let txtHist = "📜 *Últimas 5 Retiradas:*\n\n";
          historico.filter(e => e.status === "entregue").slice(-5).forEach(e => {
            txtHist += `✅ ${e.nome} (Retirado por: ${e.recebedor})\n`;
          });
          return sock.sendMessage(remetente, { text: txtHist });

        default:
          return sock.sendMessage(remetente, { text: "❌ Opção inválida. Digite de 1 a 4." });
      }
    }

    // --- ETAPA: REGISTRAR (NOME) ---
    if (estado.etapa === "esperandoNome") {
      const nomeMorador = textoUsuario.toUpperCase();
      await axios.post(URL_GOOGLE_ENCOMENDAS, {
        action: "registrar",
        id: Date.now().toString().slice(-6), // ID curto de 6 dígitos
        nome: nomeMorador,
        status: "pendente",
        data: moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")
      });
      delete estadosUsuarios[idSessao];
      return sock.sendMessage(remetente, { text: `✅ Encomenda para *${nomeMorador}* registrada com sucesso!` });
    }

    // --- ETAPA: RETIRADA (ID) ---
    if (estado.etapa === "esperandoIDRetirada") {
      estado.idParaRetirada = textoUsuario;
      estado.etapa = "esperandoQuemRetirou";
      estadosUsuarios[idSessao] = estado;
      return sock.sendMessage(remetente, { text: "✋ Quem está retirando a encomenda? (Nome do morador ou parente)" });
    }

    // --- ETAPA: RETIRADA (QUEM RECEBEU) ---
    if (estado.etapa === "esperandoQuemRetirou") {
      const recebedor = textoUsuario.toUpperCase();
      await axios.post(URL_GOOGLE_ENCOMENDAS, {
        action: "entregar",
        id: estado.idParaRetirada,
        recebedor: recebedor,
        data_entrega: moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")
      });
      delete estadosUsuarios[idSessao];
      return sock.sendMessage(remetente, { text: `✅ Entrega confirmada para *${recebedor}*!\nObrigado.` });
    }

  } catch (err) {
    console.error("Erro Encomendas:", err.message);
    return sock.sendMessage(remetente, { text: "❌ Erro ao acessar o banco de dados." });
  }
}
