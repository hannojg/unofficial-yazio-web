import type { Reply } from "./messages";

type PairStatus = { expires: number | null };
type WebSession = { accessToken?: string; refreshToken?: string };
type PageSession = { nonce: string; ready: boolean; auth: WebSession | null };
const mountingDeadline = Date.now() + 15000;

function readPageSession(): Promise<PageSession> {
  const nonce = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      document.removeEventListener("nd-web-session", receive);
      const error = new Error(
        "YAZIO's page session could not be read. Try connecting again.",
      );
      reject(error);
    }, 2000);
    function receive(event: Event) {
      if (event instanceof CustomEvent === false) return;
      const data: PageSession = event.detail;
      if (data.nonce !== nonce) return;
      clearTimeout(timer);
      document.removeEventListener("nd-web-session", receive);
      resolve(data);
    }
    document.addEventListener("nd-web-session", receive);
    const request = new CustomEvent("nd-read-web-session", { detail: nonce });
    document.dispatchEvent(request);
  });
}

async function pollSession() {
  const status: Reply<PairStatus> = await chrome.runtime.sendMessage({
    kind: "ND_PAIR_STATUS",
  });
  if (status.ok === false || status.value.expires === null) return;
  try {
    const { auth, ready } = await readPageSession();
    if (auth?.accessToken && auth.refreshToken) {
      await chrome.runtime.sendMessage({
        kind: "ND_IMPORT_SESSION",
        tokens: {
          access_token: auth.accessToken,
          refresh_token: auth.refreshToken,
        },
      });
      return;
    }
    if (ready === false && Date.now() > mountingDeadline) {
      throw new Error(
        "YAZIO's page session is unavailable. Its website may have changed.",
      );
    }
    if (Date.now() < status.value.expires) {
      setTimeout(() => void pollSession(), 1000);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "YAZIO's saved session could not be read.";
    await chrome.runtime.sendMessage({
      kind: "ND_CONNECT_FAILURE",
      error: message,
    });
  }
}

void pollSession();
