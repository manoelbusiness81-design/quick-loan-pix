const $ = (id) => document.getElementById(id);
const logEl = $("log");

function addLog(msg, type = "info") {
  const line = document.createElement("div");
  line.className = `line ${type}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  logEl.prepend(line);
}

function updateStats(state) {
  $("s-total").textContent = state.total ?? 0;
  $("s-ok").textContent = state.ok ?? 0;
  $("s-err").textContent = state.err ?? 0;
  $("s-rem").textContent = state.remaining ?? 0;
  $("start").disabled = !!state.running;
  $("stop").disabled = !state.running;
}

function parsePayload(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Esperado um array JSON");
    return data
      .map((it) => ({
        telefone: String(it.telefone || it.phone || "").replace(/\D/g, ""),
        mensagem: String(it.mensagem || it.message || ""),
        nome: String(it.nome || it.name || ""),
      }))
      .filter((it) => it.telefone.length >= 10 && it.mensagem.length > 0);
  } catch (e) {
    return null;
  }
}

$("payload").addEventListener("input", () => {
  const items = parsePayload($("payload").value);
  $("count").textContent = items ? items.length : "JSON inválido";
});

$("paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    $("payload").value = text;
    $("payload").dispatchEvent(new Event("input"));
    addLog("Lista colada da área de transferência.", "info");
  } catch {
    addLog("Não foi possível ler a área de transferência.", "err");
  }
});

$("start").addEventListener("click", async () => {
  const items = parsePayload($("payload").value);
  if (!items || items.length === 0) {
    addLog("Lista vazia ou JSON inválido.", "err");
    return;
  }
  const min = Math.max(5, parseInt($("min").value || "20", 10));
  const max = Math.max(min, parseInt($("max").value || "50", 10));
  addLog(`Iniciando disparo de ${items.length} mensagens (intervalo ${min}-${max}s).`, "info");
  await chrome.runtime.sendMessage({ type: "START", items, min, max });
});

$("stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP" });
  addLog("Disparo interrompido pelo usuário.", "err");
});

// Sync state from background
async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "STATE" });
  if (state) updateStats(state);
}
refresh();
setInterval(refresh, 1000);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "LOG") addLog(msg.message, msg.level || "info");
  if (msg?.type === "STATE") updateStats(msg.state);
});
