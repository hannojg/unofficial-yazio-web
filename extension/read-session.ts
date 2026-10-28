type WebAuth = { accessToken?: string; refreshToken?: string };

declare global {
  interface Window {
    useNuxtApp?: () => {
      $pinia?: { state: { value: { auth?: WebAuth } } };
    };
  }
}

document.addEventListener("nd-read-web-session", (event) => {
  if (event instanceof CustomEvent === false) return;
  const nonce: unknown = event.detail;
  if (typeof nonce !== "string") return;
  let auth: WebAuth | null = null;
  let ready = false;
  if (window.useNuxtApp) {
    try {
      const app = window.useNuxtApp();
      const stored = app.$pinia?.state.value.auth;
      if (stored) {
        ready = true;
        auth = {
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
        };
      }
    } catch {
      // Nuxt registers its app before the page finishes mounting.
    }
  }
  const response = new CustomEvent("nd-web-session", {
    detail: { nonce, ready, auth },
  });
  document.dispatchEvent(response);
});

export {};
