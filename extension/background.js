// Background service worker — orchestrates the dispatch queue.

const state = {
  running: false,
  items: [],
  index: 0,
  ok: 0,
  err: 0,
  total: 0,
  min: 20,
  max: 50,
  tabId: null,
  currentTimer: null,
};

function broadcast() {
  const snap = {
    running: state.running,
    ok: state.ok,
    err: state.err,
    total: state.total,
    remaining: Math.max(0, state.total - state.index),
  };
  chrome.runtime.sendMessage({ type: "STATE", state: snap }).catch(() => {});
}

function log(message, level = "info") {
  chrome.runtime.sendMessage({ type: "LOG", message, level }).catch(() => {});
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function ensureWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length > 0) {
    state.tabId = tabs[0].id;
    return tabs[0];
  }
  const tab = await chrome.tabs.create({ url: "https://web.whatsapp.com/", active: true });
  state.tabId = tab.id;
  // Wait for it to load
  await new Promise((resolve) => {
    const onUpdated = (tabId, info) => {
      if (tabId === tab.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  return tab;
}

async function navigateAndWait(url) {
  await chrome.tabs.update(state.tabId, { url, active: true });
  await new Promise((resolve) => {
    const onUpdated = (tabId, info) => {
      if (tabId === state.tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function sendOne(item) {
  const url = `https://web.whatsapp.com/send?phone=${item.telefone}&text=${encodeURIComponent(item.mensagem)}`;
  await navigateAndWait(url);

  // Ask content script to send
  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      const res = await chrome.tabs.sendMessage(state.tabId, { type: "SEND_NOW" });
      if (res && res.ok) return { ok: true };
      if (res && res.invalid) return { ok: false, reason: "número inválido" };
    } catch (e) {
      // content script might still be loading
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { ok: false, reason: "timeout" };
}

async function runQueue() {
  while (state.running && state.index < state.items.length) {
    const item = state.items[state.index];
    log(`(${state.index + 1}/${state.total}) Enviando para ${item.nome || item.telefone}…`, "info");
    try {
      const res = await sendOne(item);
      if (res.ok) {
        state.ok++;
        log(`✔ Enviado para ${item.nome || item.telefone}`, "ok");
      } else {
        state.err++;
        log(`✘ Falha (${res.reason}) — ${item.nome || item.telefone}`, "err");
      }
    } catch (e) {
      state.err++;
      log(`✘ Erro: ${e.message || e}`, "err");
    }
    state.index++;
    broadcast();
    if (!state.running) break;
    if (state.index < state.items.length) {
      const wait = rand(state.min, state.max);
      log(`⏳ Aguardando ${wait}s antes do próximo envio…`, "info");
      await new Promise((resolve) => {
        state.currentTimer = setTimeout(resolve, wait * 1000);
      });
    }
  }
  state.running = false;
  log(`Disparo finalizado — ${state.ok} enviados, ${state.err} falhas.`, "info");
  broadcast();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "START") {
      if (state.running) return sendResponse({ ok: false, reason: "Já em execução" });
      state.items = msg.items;
      state.total = msg.items.length;
      state.index = 0;
      state.ok = 0;
      state.err = 0;
      state.min = msg.min;
      state.max = msg.max;
      state.running = true;
      broadcast();
      await ensureWhatsAppTab();
      runQueue();
      sendResponse({ ok: true });
    } else if (msg?.type === "STOP") {
      state.running = false;
      if (state.currentTimer) clearTimeout(state.currentTimer);
      broadcast();
      sendResponse({ ok: true });
    } else if (msg?.type === "STATE") {
      sendResponse({
        running: state.running,
        ok: state.ok,
        err: state.err,
        total: state.total,
        remaining: Math.max(0, state.total - state.index),
      });
    }
  })();
  return true;
});
