import { ApiError, checkResponse, refreshTokens, upstream } from "../lib/yazio";
import type { Tokens } from "../lib/yazio";

export type TokenStore = {
  read: () => Promise<Tokens | null>;
  write: (tokens: Tokens) => Promise<void>;
  remove: () => Promise<void>;
};
export type YazioApi = (path: string, init?: RequestInit) => Promise<unknown>;

export function createSession(store: TokenStore, changed: () => Promise<void>) {
  let revision = 0;
  let refreshing: Promise<Tokens> | null = null;

  async function connect(tokens: Tokens) {
    revision++;
    await store.write(tokens);
    await changed();
  }

  async function disconnect() {
    revision++;
    await store.remove();
    await changed();
  }

  async function renew(previous: Tokens, expectedRevision: number) {
    const current = await store.read();
    if (expectedRevision !== revision || current === null) {
      throw new ApiError("Connect your YAZIO account first.", 401);
    }
    if (current.access_token !== previous.access_token) return current;
    if (refreshing) return refreshing;
    const currentTokens = current;
    async function refresh() {
      let tokens: Tokens;
      try {
        tokens = await refreshTokens(currentTokens);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          revision === expectedRevision
        ) {
          await disconnect();
        }
        throw error;
      }
      if (revision !== expectedRevision) {
        throw new ApiError("The YAZIO connection changed. Try again.", 401);
      }
      await store.write(tokens);
      return tokens;
    }
    refreshing = refresh();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }

  async function api(path: string, init?: RequestInit) {
    const expectedRevision = revision;
    const tokens = await store.read();
    if (tokens === null)
      throw new ApiError("Connect your YAZIO account first.", 401);
    let response = await upstream(path, tokens, init);
    if (response.status === 401) {
      const renewed = await renew(tokens, expectedRevision);
      response = await upstream(path, renewed, init);
    }
    await checkResponse(response);
    if (response.status === 204) return null;
    const body = await response.text();
    return body.length > 0 ? JSON.parse(body) : null;
  }

  return { read: store.read, connect, disconnect, api };
}
