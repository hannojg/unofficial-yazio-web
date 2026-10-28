(() => {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const input = args[0];
    const target = input instanceof Request ? input.url : String(input);
    const url = new URL(target, window.location.origin);
    if (url.origin !== "https://www.yazio.com" || url.pathname !== "/api/auth/token" || !response.ok) return response;
    const copy = response.clone();
    void copy.json().then((tokens) => {
      if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") return;
      const detail = { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
      const event = new CustomEvent("nutrition-desk-token", { detail });
      document.dispatchEvent(event);
    }).catch(() => {});
    return response;
  };
})();
