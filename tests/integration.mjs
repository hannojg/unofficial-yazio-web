import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const base = "http://127.0.0.1:5173";
let cookie = "";
async function signIn() {
  const response = await fetch(`${base}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
  const values = response.headers.getSetCookie();
  cookie = values.map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie, "local preview sign-in should issue an identity cookie");
}
await signIn();

async function post(path, body, extra = {}) {
  return fetch(`${base}${path}`, { method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
}

test("unauthenticated callers cannot access a diary", async () => {
  const response = await fetch(`${base}/api/day?date=2026-10-28`);
  assert.equal(response.status, 401);
});

test("session state has no tokens before connecting", async () => {
  const response = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { connected: false });
});

test("a foreign origin cannot begin a session handoff", async () => {
  const response = await post("/api/connect", {}, { Origin: "https://untrusted.example" });
  assert.equal(response.status, 403);
});

test("pairing uses an encrypted HttpOnly cookie and rejects another nonce", async () => {
  const response = await post("/api/connect", {});
  assert.equal(response.status, 200);
  const pair = await response.json();
  assert.match(pair.nonce, /^[0-9a-f-]{36}$/);
  const pairCookie = response.headers.getSetCookie()[0];
  assert.match(pairCookie, /HttpOnly/i);
  assert.match(pairCookie, /SameSite=Strict/i);
  assert.equal(pairCookie.includes(pair.nonce), false);
  const part = pairCookie.split(";")[0];
  const oldCookie = cookie;
  cookie += `; ${part}`;
  const invalid = await post("/api/session", { nonce: "11111111-1111-4111-8111-111111111111", access_token: "synthetic-test-access", refresh_token: "synthetic-test-refresh" });
  assert.equal(invalid.status, 401);
  cookie = oldCookie;
});

test("a token cannot be imported without a pairing cookie", async () => {
  const response = await post("/api/session", { nonce: "11111111-1111-4111-8111-111111111111", access_token: "synthetic-test-access", refresh_token: "synthetic-test-refresh" });
  assert.equal(response.status, 401);
});

test("helper observes only successful token exchanges on YAZIO", async () => {
  const source = await readFile(new URL("../browser-helper/capture.js", import.meta.url), "utf8");
  const events = [];
  const tokens = { access_token: "synthetic-access", refresh_token: "synthetic-refresh" };
  const originalResponse = Response.json(tokens);
  const window = { location: { origin: "https://www.yazio.com" }, fetch: async () => originalResponse };
  const context = vm.createContext({ window, URL, Request, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, document: { dispatchEvent: (event) => events.push(event) } });
  vm.runInContext(source, context);
  await window.fetch("https://other.example/api/auth/token");
  await window.fetch("/api/proxy/app/user");
  assert.equal(events.length, 0);
  const result = await window.fetch("/api/auth/token");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(result, originalResponse);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.access_token, tokens.access_token);
  assert.equal(events[0].detail.refresh_token, tokens.refresh_token);
});

test("helper cannot hand a token to an unpaired tab or foreign website", async () => {
  const source = await readFile(new URL("../browser-helper/background.js", import.meta.url), "utf8");
  let listener;
  let pair = null;
  let sends = 0;
  const chrome = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    storage: { session: {
      async get() { return { pairing: pair }; },
      async set(value) { pair = value.pairing; },
      async remove() { pair = null; },
    } },
    tabs: { async create() { return { id: 99 }; }, async sendMessage() { sends++; return { ok: true }; }, async update() {}, onRemoved: { addListener() {} } },
  };
  vm.runInNewContext(source, { chrome, URL, Set, Date });
  const dispatch = (message, sender) => new Promise((resolve) => listener(message, sender, resolve));
  const denied = await dispatch({ type: "START_PAIR", nonce: "11111111-1111-4111-8111-111111111111" }, { url: "https://evil.example/", tab: { id: 5 }, frameId: 0 });
  assert.equal(denied.error, "This desk is not allowed.");
  await dispatch({ type: "START_PAIR", nonce: "11111111-1111-4111-8111-111111111111" }, { url: `${base}/`, tab: { id: 5 }, frameId: 0 });
  const tokens = { access_token: "synthetic-access", refresh_token: "synthetic-refresh" };
  await dispatch({ type: "TOKEN_CAPTURED", tokens }, { url: "https://www.yazio.com/", tab: { id: 33 }, frameId: 0 });
  assert.equal(sends, 0);
  await dispatch({ type: "TOKEN_CAPTURED", tokens }, { url: "https://www.yazio.com/", tab: { id: 99 }, frameId: 0 });
  assert.equal(sends, 1);
  assert.equal(pair, null);
});
