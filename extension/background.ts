import { z } from "zod";
import {
  ApiError,
  checkResponse,
  profileSchema,
  refreshTokens,
  tokenSchema,
  upstream,
} from "../lib/yazio";
import type { Tokens } from "../lib/yazio";
import { runDiaryCommand } from "../lib/diary";
import { commandSchema } from "./messages";
import type { Command, DeskEvent, Reply } from "./messages";
import { createSession } from "./session";
import { configureClientHeader } from "./client-header";

type Pair = { deskTab: number; yazioTab: number; expires: number };
let pairingRevision = 0;
async function initialize() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await configureClientHeader();
}
const ready = initialize();

async function readTokens() {
  await ready;
  const stored = await chrome.storage.local.get("tokens");
  return stored.tokens ? tokenSchema.parse(stored.tokens) : null;
}

async function writeTokens(tokens: Tokens) {
  await ready;
  await chrome.storage.local.set({ tokens });
}

async function removeTokens() {
  await ready;
  await chrome.storage.local.remove("tokens");
}

async function notify(event: DeskEvent) {
  try {
    await chrome.runtime.sendMessage(event);
  } catch {
    // The dashboard does not need to stay open for session renewal.
  }
}

async function changed() {
  await notify({ kind: "ND_SESSION_CHANGED" });
}
const session = createSession(
  { read: readTokens, write: writeTokens, remove: removeTokens },
  changed,
);

async function readPair(): Promise<Pair | null> {
  const stored = await chrome.storage.session.get<{ pairing?: Pair }>(
    "pairing",
  );
  return stored.pairing ?? null;
}

function isDesk(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.url)
    return false;
  const page = new URL(sender.url);
  return (
    page.protocol === "chrome-extension:" &&
    page.host === chrome.runtime.id &&
    page.pathname === "/index.html"
  );
}

async function pairedTab(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.url)
    return null;
  const source = new URL(sender.url);
  if (source.origin !== "https://www.yazio.com") return null;
  const pair = await readPair();
  if (pair === null || pair.yazioTab !== sender.tab?.id) return null;
  return pair;
}

async function failPair(sender: chrome.runtime.MessageSender, error: string) {
  const pair = await pairedTab(sender);
  if (pair === null) return;
  pairingRevision++;
  await chrome.storage.session.remove("pairing");
  await notify({ kind: "ND_PAIR_ERROR", error });
}

async function run(command: Command, sender: chrome.runtime.MessageSender) {
  switch (command.type) {
    case "session": {
      const tokens = await session.read();
      const pair = await readPair();
      const pairingExpires =
        pair !== null && pair.expires > Date.now() ? pair.expires : undefined;
      if (tokens === null) return { connected: false, pairingExpires };
      try {
        const raw = await session.api("/user");
        const profile = profileSchema.parse(raw);
        return { connected: true, profile, pairingExpires };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          return { connected: false, pairingExpires };
        throw error;
      }
    }
    case "connect": {
      const expectedRevision = ++pairingRevision;
      if (sender.tab?.id === undefined)
        throw new ApiError("Open (unofficial) yazio web in a browser tab.", 400);
      const tab = await chrome.tabs.create({
        url: "about:blank",
      });
      if (tab.id === undefined)
        throw new ApiError("YAZIO could not be opened.", 500);
      if (pairingRevision !== expectedRevision)
        throw new ApiError(
          "A newer connection has started. Use its YAZIO tab.",
          409,
        );
      const pair: Pair = {
        deskTab: sender.tab.id,
        yazioTab: tab.id,
        expires: Date.now() + 600000,
      };
      await chrome.storage.session.set({ pairing: pair });
      await chrome.tabs.update(tab.id, {
        url: "https://www.yazio.com/en/app/account/login",
      });
      return { expires: pair.expires };
    }
    case "cancel-pair":
      pairingRevision++;
      await chrome.storage.session.remove("pairing");
      return null;
    case "disconnect":
      pairingRevision++;
      await session.disconnect();
      await chrome.storage.session.remove("pairing");
      return null;
    default:
      return runDiaryCommand(command, session.api);
  }
}

async function importSession(
  raw: unknown,
  sender: chrome.runtime.MessageSender,
) {
  const expectedRevision = pairingRevision;
  const pair = await pairedTab(sender);
  if (pair === null) {
    throw new ApiError("Start a connection from (unofficial) yazio web first.", 403);
  }
  if (pair.expires <= Date.now()) {
    await chrome.storage.session.remove("pairing");
    throw new ApiError(
      "The connection expired. Start again in (unofficial) yazio web.",
      401,
    );
  }
  try {
    let tokens = tokenSchema.parse(raw);
    let response = await upstream("/user", tokens);
    if (response.status === 401) {
      tokens = await refreshTokens(tokens);
      response = await upstream("/user", tokens);
    }
    await checkResponse(response);
    const rawProfile = await response.json();
    profileSchema.parse(rawProfile);
    const current = await readPair();
    if (
      current === null ||
      current.expires !== pair.expires ||
      current.expires <= Date.now()
    ) {
      throw new ApiError(
        "This connection was cancelled. Start again in (unofficial) yazio web.",
        401,
      );
    }
    await chrome.storage.session.remove("pairing");
    if (pairingRevision !== expectedRevision) {
      throw new ApiError(
        "This connection was cancelled. Start again in (unofficial) yazio web.",
        401,
      );
    }
    await session.connect(tokens);
    await chrome.tabs.update(pair.deskTab, { active: true });
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "YAZIO could not be connected.";
    if (pairingRevision === expectedRevision) await failPair(sender, message);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const supported = [
    "ND_REQUEST",
    "ND_IMPORT_SESSION",
    "ND_PAIR_STATUS",
    "ND_CONNECT_FAILURE",
  ];
  if (supported.includes(message?.kind) === false) return;
  async function respond() {
    let reply: Reply<unknown>;
    try {
      await ready;
      let value: unknown;
      if (message.kind === "ND_IMPORT_SESSION") {
        value = await importSession(message.tokens, sender);
      } else if (message.kind === "ND_PAIR_STATUS") {
        const pair = await pairedTab(sender);
        value = {
          expires:
            pair !== null && pair.expires > Date.now() ? pair.expires : null,
        };
      } else if (message.kind === "ND_CONNECT_FAILURE") {
        const description =
          typeof message.error === "string"
            ? message.error
            : "YAZIO could not be connected.";
        await failPair(sender, description);
        value = null;
      } else {
        if (isDesk(sender) === false)
          throw new ApiError(
            "Open (unofficial) yazio web from its extension icon.",
            403,
          );
        const command = commandSchema.parse(message.command);
        value = await run(command, sender);
      }
      reply = { ok: true, value };
    } catch (error) {
      let description =
        "The request could not be completed. Check your connection and try again.";
      let status = 502;
      if (error instanceof ApiError) {
        description = error.message;
        status = error.status;
      } else if (error instanceof z.ZodError) {
        description =
          "The data format did not match the expected YAZIO API. No change has been confirmed.";
        status = 422;
      }
      reply = { ok: false, error: description, status };
    }
    sendResponse(reply);
  }
  void respond();
  return true;
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("index.html");
  const tabs = await chrome.tabs.query({ url });
  const existing = tabs[0];
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
});

chrome.tabs.onRemoved.addListener(async (id) => {
  const pair = await readPair();
  if (pair === null || (pair.deskTab !== id && pair.yazioTab !== id)) return;
  pairingRevision++;
  await chrome.storage.session.remove("pairing");
  if (pair.yazioTab === id) {
    await notify({
      kind: "ND_PAIR_ERROR",
      error: "The sign-in tab closed. Click Connect to try again.",
    });
  }
});
