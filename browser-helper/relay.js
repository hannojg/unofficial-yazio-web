(() => {
  const origin = window.location.origin;
  const isYazio = origin === "https://www.yazio.com";
  if (isYazio) {
    document.addEventListener("nutrition-desk-token", (event) => {
      const tokens = event.detail;
      chrome.runtime.sendMessage({ type: "TOKEN_CAPTURED", tokens }).catch(() => {});
    });
    return;
  }
  function post(type, extra = {}) {
    window.postMessage({ type, ...extra }, origin);
  }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== origin) return;
    if (event.data?.type === "ND_HELPER_PING") post("ND_HELPER_READY");
    if (event.data?.type === "ND_CONNECT") {
      try {
        const result = await chrome.runtime.sendMessage({ type: "START_PAIR", nonce: event.data.nonce });
        if (result.error) post("ND_ERROR", { error: result.error });
      } catch { post("ND_ERROR", { error: "The helper could not open YAZIO. Reload this page and try again." }); }
    }
    if (event.data?.type === "ND_CANCEL") await chrome.runtime.sendMessage({ type: "CANCEL_PAIR" });
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message.type !== "COMPLETE_PAIR") return;
    const body = JSON.stringify({ ...message.tokens, nonce: message.nonce });
    fetch("/api/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "YAZIO could not be connected.");
        post("ND_CONNECTED");
        sendResponse({ ok: true });
      })
      .catch((error) => {
        post("ND_ERROR", { error: error.message });
        sendResponse({ error: error.message });
      });
    return true;
  });
  post("ND_HELPER_READY");
})();
