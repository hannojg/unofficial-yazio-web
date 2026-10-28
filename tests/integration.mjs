import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import vm from "node:vm";

const result = await build({
  entryPoints: ["extension/background.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
});
const code = result.outputFiles[0].text;
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const desk = {
  id: extensionId,
  frameId: 0,
  url: `chrome-extension://${extensionId}/index.html`,
  tab: { id: 1 },
};
const tokens = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
};
const rotated = {
  access_token: "synthetic-rotated-access",
  refresh_token: "synthetic-rotated-refresh",
};
const profile = {
  first_name: "Test",
  sex: "male",
  country: "AT",
  language: "en",
  unit_energy: "kcal",
};

function fixture(
  fetcher = async () => Response.json(profile),
  installHeaders = async () => {},
) {
  const local = {};
  const session = {};
  const events = [];
  const requests = [];
  const opened = [];
  const rules = [];
  let messageListener;
  let removedListener;
  let actionListener;
  let accessLevel;
  let now = Date.now();
  function area(data) {
    return {
      async get(key) {
        return { [key]: data[key] };
      },
      async set(values) {
        Object.assign(data, values);
      },
      async remove(key) {
        delete data[key];
      },
      async setAccessLevel(options) {
        accessLevel = options.accessLevel;
      },
    };
  }
  const chrome = {
    declarativeNetRequest: {
      async updateDynamicRules(options) {
        rules.push(options);
        await installHeaders();
      },
    },
    storage: { local: area(local), session: area(session) },
    runtime: {
      id: extensionId,
      getURL(path) {
        return `chrome-extension://${extensionId}/${path}`;
      },
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
      async sendMessage(event) {
        events.push(event);
      },
    },
    tabs: {
      async create(options) {
        const id = opened.length + 10;
        const tab = { id, ...options };
        opened.push(tab);
        return tab;
      },
      async update() {},
      async query() {
        return [];
      },
      onRemoved: {
        addListener(listener) {
          removedListener = listener;
        },
      },
    },
    windows: { async update() {} },
    action: {
      onClicked: {
        addListener(listener) {
          actionListener = listener;
        },
      },
    },
  };
  async function fetch(url, init) {
    requests.push({ url, init });
    return fetcher(url, init);
  }
  function restart() {
    class Clock extends Date {
      static now() {
        return now;
      }
    }
    vm.runInNewContext(code, {
      chrome,
      fetch,
      URL,
      Headers,
      Response,
      Request,
      AbortSignal,
      crypto,
      Date: Clock,
      console,
    });
  }
  restart();
  function message(value, sender = desk) {
    return new Promise((resolve) => {
      const held = messageListener(value, sender, resolve);
      if (held !== true) resolve(undefined);
    });
  }
  function request(command, sender = desk) {
    return message({ kind: "ND_REQUEST", command }, sender);
  }
  function capture(value = tokens, sender = {}) {
    const tab = opened.at(-1);
    const source = {
      id: extensionId,
      frameId: 0,
      url: "https://www.yazio.com/app/login",
      tab: { id: tab?.id },
      ...sender,
    };
    return message({ kind: "ND_IMPORT_SESSION", tokens: value }, source);
  }
  return {
    local,
    session,
    events,
    requests,
    opened,
    rules,
    request,
    capture,
    restart,
    accessLevel: () => accessLevel,
    advance(ms) {
      now += ms;
    },
    removeTab(id) {
      return removedListener(id);
    },
    clickAction() {
      return actionListener();
    },
  };
}

function plain(value) {
  const json = JSON.stringify(value);
  return JSON.parse(json);
}

test("the extension is disconnected initially and content scripts cannot read tokens or request a diary", async () => {
  const app = fixture();
  const reply = await app.request({ type: "session" });
  assert.equal(reply.ok, true);
  assert.equal(reply.value.connected, false);
  const accessLevel = app.accessLevel();
  assert.equal(accessLevel, "TRUSTED_CONTEXTS");
  assert.equal(app.requests.length, 0);
  const rejected = await app.request(
    { type: "day", date: "2026-10-28" },
    { ...desk, url: "https://www.yazio.com/" },
  );
  assert.equal(rejected.status, 403);
  const foreign = await app.request(
    { type: "session" },
    { ...desk, id: "other-extension" },
  );
  assert.equal(foreign.status, 403);
});

test("session imports are accepted only from the user-started, unexpired YAZIO tab", async () => {
  const app = fixture();
  const rejected = await app.capture();
  assert.equal(rejected.status, 403);
  await app.request({ type: "connect" });
  const otherTab = await app.capture(tokens, { tab: { id: 999 } });
  assert.equal(otherTab.status, 403);
  const iframe = await app.capture(tokens, { frameId: 1 });
  assert.equal(iframe.status, 403);
  const otherOrigin = await app.capture(tokens, {
    url: "https://example.com/app/login",
  });
  assert.equal(otherOrigin.status, 403);
  assert.equal(app.requests.length, 0);
  app.advance(600001);
  const expired = await app.capture();
  assert.equal(expired.status, 401);
  assert.equal(app.local.tokens, undefined);
});

test("a paired session is validated, stored locally, and survives a worker restart without exposing tokens to the UI", async () => {
  const app = fixture();
  await app.request({ type: "connect" });
  const reply = await app.capture();
  assert.equal(reply.ok, true);
  const savedTokens = plain(app.local.tokens);
  assert.deepEqual(savedTokens, tokens);
  assert.equal(app.session.pairing, undefined);
  assert.equal(app.requests[0].url, "https://yzapi.yazio.com/v22/user");
  assert.equal(app.requests[0].init.credentials, "omit");
  app.restart();
  const state = await app.request({ type: "session" });
  assert.equal(state.value.profile.first_name, "Test");
  const stateText = JSON.stringify(state);
  const stateHasToken = stateText.includes(tokens.access_token);
  assert.equal(stateHasToken, false);
  const eventText = JSON.stringify(app.events);
  const eventHasToken = eventText.includes(tokens.refresh_token);
  assert.equal(eventHasToken, false);
});

test("a sign-in pairing survives a worker restart and stops when its YAZIO tab closes", async () => {
  const app = fixture();
  const connection = await app.request({ type: "connect" });
  app.restart();
  const state = await app.request({ type: "session" });
  assert.equal(state.value.pairingExpires, connection.value.expires);
  await app.removeTab(app.opened[0].id);
  const rejected = await app.capture();
  assert.equal(rejected.status, 403);
  const lastEvent = app.events.at(-1);
  assert.equal(lastEvent.kind, "ND_PAIR_ERROR");
});

test("cancelling a connection during token validation cannot recreate a session", async () => {
  let finish;
  let started;
  const beginning = new Promise((resolve) => {
    started = resolve;
  });
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = fixture(async () => {
    started();
    return pending;
  });
  await app.request({ type: "connect" });
  const importing = app.capture();
  await beginning;
  await app.request({ type: "disconnect" });
  const response = Response.json(profile);
  finish(response);
  const reply = await importing;
  assert.equal(reply.ok, false);
  assert.equal(app.local.tokens, undefined);
});

test("simultaneous expired requests share one refresh and persist rotated tokens", async () => {
  let refreshes = 0;
  const app = fixture(async (url, init) => {
    if (url === "https://www.yazio.com/api/auth/token") {
      refreshes++;
      const payload = JSON.parse(init.body);
      assert.equal(payload.grant_type, "refresh_token");
      assert.equal(payload.refresh_token, tokens.refresh_token);
      await Promise.resolve();
      return Response.json(rotated);
    }
    if (init.headers.get("Authorization") === `Bearer ${tokens.access_token}`) {
      return new Response(null, { status: 401 });
    }
    return Response.json(profile);
  });
  app.local.tokens = tokens;
  const first = app.request({ type: "session" });
  const second = app.request({ type: "session" });
  const replies = await Promise.all([first, second]);
  assert.equal(replies[0].value.connected, true);
  assert.equal(replies[1].value.connected, true);
  assert.equal(refreshes, 1);
  const savedTokens = plain(app.local.tokens);
  assert.deepEqual(savedTokens, rotated);
});

test("disconnecting while refresh is in flight cannot restore the local session", async () => {
  let finish;
  let started;
  const beginning = new Promise((resolve) => {
    started = resolve;
  });
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = fixture(async (url) => {
    if (url === "https://www.yazio.com/api/auth/token") {
      started();
      return pending;
    }
    return new Response(null, { status: 401 });
  });
  app.local.tokens = tokens;
  const loading = app.request({ type: "session" });
  await beginning;
  await app.request({ type: "disconnect" });
  const response = Response.json(rotated);
  finish(response);
  await loading;
  assert.equal(app.local.tokens, undefined);
});

test("a rejected refresh removes the expired session and updates the dashboard", async () => {
  const app = fixture(async () => new Response(null, { status: 401 }));
  app.local.tokens = tokens;
  const reply = await app.request({ type: "session" });
  assert.equal(reply.value.connected, false);
  assert.equal(app.local.tokens, undefined);
  const lastEvent = app.events.at(-1);
  assert.equal(lastEvent.kind, "ND_SESSION_CHANGED");
});

test("clicking the extension action opens the packaged dashboard", async () => {
  const app = fixture();
  await app.clickAction();
  assert.equal(
    app.opened[0].url,
    `chrome-extension://${extensionId}/index.html`,
  );
});

test("a failed session validation clears pairing so reloading cannot stay stuck waiting", async () => {
  const app = fixture(async () => new Response(null, { status: 403 }));
  await app.request({ type: "connect" });
  const rejected = await app.capture();
  assert.equal(rejected.ok, false);
  assert.equal(app.session.pairing, undefined);
  app.restart();
  const state = await app.request({ type: "session" });
  assert.equal(state.value.connected, false);
  assert.equal(state.value.pairingExpires, undefined);
  const lastEvent = app.events.at(-1);
  assert.equal(lastEvent.kind, "ND_PAIR_ERROR");
});

test("the client-header rule is limited to this extension's own YAZIO API requests", async () => {
  const app = fixture();
  await app.request({ type: "session" });
  const options = plain(app.rules[0]);
  assert.deepEqual(options.removeRuleIds, [1]);
  assert.equal(options.addRules.length, 1);
  const rule = options.addRules[0];
  assert.equal(rule.condition.urlFilter, "|https://yzapi.yazio.com/v22/");
  assert.deepEqual(rule.condition.initiatorDomains, [extensionId]);
  assert.deepEqual(rule.condition.resourceTypes, ["xmlhttprequest"]);
  assert.equal(rule.action.type, "modifyHeaders");
  assert.equal(rule.action.requestHeaders.length, 1);
  assert.equal(rule.action.requestHeaders[0].header, "user-agent");
  assert.match(rule.action.requestHeaders[0].value, /^YAZIO\/26\.28\.0 /);
});

test("API requests wait until Chrome has installed the required client header", async () => {
  let finish;
  const installation = new Promise((resolve) => {
    finish = resolve;
  });
  const app = fixture(
    async () => Response.json(profile),
    () => installation,
  );
  app.local.tokens = tokens;
  const loading = app.request({ type: "session" });
  await new Promise(setImmediate);
  assert.equal(app.requests.length, 0);
  finish();
  const reply = await loading;
  assert.equal(reply.value.connected, true);
  assert.equal(app.requests.length, 1);
});
