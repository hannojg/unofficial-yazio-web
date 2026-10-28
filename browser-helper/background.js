const DESK_ORIGINS = new Set([
  "https://nutrition-desk-hanno.equalcandy26.chatgpt.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

async function handle(message, sender) {
  if (!sender.tab?.id || !sender.url) return { error: "No requesting tab." };
  const source = new URL(sender.url);
  if (message.type === "START_PAIR") {
    if (!DESK_ORIGINS.has(source.origin) || sender.frameId !== 0) return { error: "This desk is not allowed." };
    if (typeof message.nonce !== "string" || message.nonce.length !== 36) return { error: "Invalid connection request." };
    const tab = await chrome.tabs.create({ url: "https://www.yazio.com/en/app/account/login" });
    await chrome.storage.session.set({ pairing: { nonce: message.nonce, appTab: sender.tab.id, yazioTab: tab.id, expires: Date.now() + 600000 } });
    return { ok: true };
  }
  if (message.type === "CANCEL_PAIR") {
    const state = await chrome.storage.session.get("pairing");
    if (state.pairing?.appTab === sender.tab.id) await chrome.storage.session.remove("pairing");
    return { ok: true };
  }
  if (message.type !== "TOKEN_CAPTURED" || source.origin !== "https://www.yazio.com" || sender.frameId !== 0) return { ignored: true };
  const state = await chrome.storage.session.get("pairing");
  const pair = state.pairing;
  if (!pair || pair.yazioTab !== sender.tab.id) return { ignored: true };
  if (pair.expires < Date.now()) {
    await chrome.storage.session.remove("pairing");
    return { error: "The connection expired. Start again in Nutrition Desk." };
  }
  const accessToken = message.tokens?.access_token;
  const refreshToken = message.tokens?.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return { error: "Missing session tokens." };
  const tokens = { access_token: accessToken, refresh_token: refreshToken };
  const result = await chrome.tabs.sendMessage(pair.appTab, { type: "COMPLETE_PAIR", nonce: pair.nonce, tokens });
  if (result?.ok) {
    await chrome.storage.session.remove("pairing");
    await chrome.tabs.update(pair.appTab, { active: true });
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(() => {
    sendResponse({ error: "The connection could not finish. Keep Nutrition Desk open and try again." });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(async (id) => {
  const state = await chrome.storage.session.get("pairing");
  const pair = state.pairing;
  if (pair && (pair.appTab === id || pair.yazioTab === id)) await chrome.storage.session.remove("pairing");
});
