import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import vm from "node:vm";

async function bundle(entry) {
  const built = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
  });
  return built.outputFiles[0].text;
}
const main = await bundle("extension/read-session.ts");
const relay = await bundle("extension/connect.ts");
const tokens = {
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
};

async function fixture(initial, pairing = true, mounting = true) {
  const messages = [];
  const timers = [];
  const auth = { value: initial };
  let finish;
  let reads = 0;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  const chrome = {
    runtime: {
      async sendMessage(message) {
        messages.push(message);
        if (message.kind === "ND_PAIR_STATUS") {
          if (pairing === false) finish();
          return {
            ok: true,
            value: { expires: pairing ? Date.now() + 600000 : null },
          };
        }
        finish();
        return { ok: true, value: null };
      },
    },
  };
  const window = {
    useNuxtApp() {
      reads++;
      if (mounting === false) throw new Error("Not mounted yet");
      return { $pinia: { state: { value: { auth: auth.value } } } };
    },
  };
  const document = new EventTarget();
  function schedule(callback, delay) {
    if (delay === 1000) {
      timers.push(callback);
      finish();
      return -1;
    }
    return setTimeout(callback, delay);
  }
  const context = vm.createContext({
    chrome,
    window,
    document,
    Date,
    crypto,
    CustomEvent,
    setTimeout: schedule,
    clearTimeout,
  });
  vm.runInContext(main, context);
  vm.runInContext(relay, context);
  await completed;
  return { messages, timers, auth, reads: () => reads };
}
function plain(value) {
  const json = JSON.stringify(value);
  return JSON.parse(json);
}

test("an already signed-in YAZIO session connects without a new login request", async () => {
  const app = await fixture(tokens);
  const imported = app.messages.find(
    (message) => message.kind === "ND_IMPORT_SESSION",
  );
  const importedTokens = plain(imported.tokens);
  assert.deepEqual(importedTokens, {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  assert.equal(app.timers.length, 0);
});

test("an unpaired YAZIO tab never reads the web session", async () => {
  const app = await fixture(tokens, false);
  const reads = app.reads();
  assert.equal(reads, 0);
  assert.equal(app.timers.length, 0);
});

test("a signed-out page waits for the same page session to appear after sign-in", async () => {
  const app = await fixture({});
  assert.equal(app.timers.length, 1);
  app.auth.value = tokens;
  await app.timers[0]();
  await new Promise(setImmediate);
  const imported = app.messages.find(
    (message) => message.kind === "ND_IMPORT_SESSION",
  );
  assert.equal(imported.tokens.access_token, tokens.accessToken);
});

test("a mounting Nuxt app is allowed to become ready before reading its auth store", async () => {
  const app = await fixture(tokens, true, false);
  assert.equal(app.timers.length, 1);
  const imported = app.messages.some(
    (message) => message.kind === "ND_IMPORT_SESSION",
  );
  assert.equal(imported, false);
});
