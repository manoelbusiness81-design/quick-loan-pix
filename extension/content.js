// Runs inside web.whatsapp.com — clicks the send button after the chat loads.

function waitFor(selector, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return reject(new Error("timeout waiting " + selector));
      setTimeout(check, 400);
    };
    check();
  });
}

function isInvalidNumberDialog() {
  // WhatsApp shows "Telefone compartilhado via URL é inválido" or similar
  const text = document.body.innerText || "";
  return /número de telefone|phone number|inválido|invalid|shared via url/i.test(text)
    && !!document.querySelector('[data-animate-modal-popup="true"]');
}

async function sendCurrentChat() {
  // If invalid number popup is shown, abort
  await new Promise((r) => setTimeout(r, 1500));
  if (isInvalidNumberDialog()) {
    // try to close the dialog
    const okBtn = document.querySelector('[data-animate-modal-popup="true"] [role="button"]');
    if (okBtn) okBtn.click();
    return { ok: false, invalid: true };
  }

  // Wait for the message composer and send button
  try {
    // Footer composer
    await waitFor('footer [contenteditable="true"], div[role="textbox"][contenteditable="true"]', 25000);
  } catch (e) {
    return { ok: false, invalid: true };
  }

  // Find the send button (Enviar)
  let sendBtn = null;
  for (let i = 0; i < 20; i++) {
    sendBtn =
      document.querySelector('button[aria-label="Enviar"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      document.querySelector('span[data-icon="send"]')?.closest('button') ||
      document.querySelector('span[data-icon="wds-ic-send-filled"]')?.closest('button');
    if (sendBtn) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!sendBtn) {
    // Fallback: press Enter on the composer
    const box = document.querySelector('footer [contenteditable="true"]');
    if (box) {
      box.focus();
      const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true });
      box.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 1500));
      return { ok: true };
    }
    return { ok: false };
  }

  sendBtn.click();
  await new Promise((r) => setTimeout(r, 1500));
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SEND_NOW") {
    sendCurrentChat()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
