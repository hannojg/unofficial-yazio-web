import { cookies } from "next/headers";
import { z } from "zod";
import { getChatGPTUser } from "../app/chatgpt-auth";
import {
  ApiError,
  tokenSchema,
  refreshTokens,
  upstream,
  checkResponse,
} from "./yazio";
import type { Tokens } from "./yazio";

const text = z.string();
const numeric = z.number();
const sessionSchema = tokenSchema.extend({ userId: text });
const pairingSchema = z.object({ userId: text, nonce: text, expires: numeric });
const encoder = new TextEncoder();

async function key() {
  const secret = process.env.NUTRITION_SESSION_KEY;
  if (!secret)
    throw new ApiError("The session encryption key is not configured.", 503);
  const raw = encoder.encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(value: unknown) {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const json = JSON.stringify(value);
  const data = encoder.encode(json);
  const encryptionKey = await key();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    encryptionKey,
    data,
  );
  const bytes = new Uint8Array(12 + encrypted.byteLength);
  bytes.set(nonce);
  const encryptedBytes = new Uint8Array(encrypted);
  bytes.set(encryptedBytes, 12);
  const buffer = Buffer.from(bytes);
  return buffer.toString("base64url");
}

export async function unseal(value: string): Promise<unknown> {
  const bytes = Buffer.from(value, "base64url");
  const nonce = bytes.subarray(0, 12);
  const data = bytes.subarray(12);
  const encryptionKey = await key();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    encryptionKey,
    data,
  );
  const decoder = new TextDecoder();
  const json = decoder.decode(decrypted);
  return JSON.parse(json);
}

export async function identity() {
  const user = await getChatGPTUser();
  if (!user)
    throw new ApiError("Sign in to your private Nutrition Desk first.", 401);
  return user.userId;
}

export function assertOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin !== url.origin)
    throw new ApiError("This request must come from Nutrition Desk.", 403);
}

async function writeCookie(
  name: string,
  value: unknown,
  maxAge: number,
  request: Request,
) {
  const jar = await cookies();
  const encrypted = await seal(value);
  const url = new URL(request.url);
  jar.set(name, encrypted, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export async function beginPair(request: Request) {
  assertOrigin(request);
  const userId = await identity();
  const nonce = crypto.randomUUID();
  const expires = Date.now() + 600000;
  await writeCookie("nd_pair", { userId, nonce, expires }, 600, request);
  return nonce;
}

export async function verifyPair(request: Request, nonce: string) {
  assertOrigin(request);
  const userId = await identity();
  const jar = await cookies();
  const cookie = jar.get("nd_pair");
  if (!cookie)
    throw new ApiError(
      "The connection expired. Start again from Nutrition Desk.",
      401,
    );
  const decrypted = await unseal(cookie.value);
  const pair = pairingSchema.parse(decrypted);
  if (
    pair.userId !== userId ||
    pair.nonce !== nonce ||
    pair.expires < Date.now()
  ) {
    throw new ApiError(
      "The connection expired. Start again from Nutrition Desk.",
      401,
    );
  }
  return userId;
}

export async function saveSession(
  tokens: Tokens,
  userId: string,
  request: Request,
) {
  const value = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    userId,
  };
  await writeCookie("nd_session", value, 2592000, request);
  const jar = await cookies();
  jar.delete("nd_pair");
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete("nd_session");
  jar.delete("nd_pair");
}

export async function client(request: Request) {
  const userId = await identity();
  const jar = await cookies();
  const cookie = jar.get("nd_session");
  if (!cookie) return null;
  const decrypted = await unseal(cookie.value);
  const session = sessionSchema.parse(decrypted);
  if (session.userId !== userId)
    throw new ApiError("This session belongs to a different account.", 401);
  let tokens: Tokens = session;
  return async (path: string, init: RequestInit = {}) => {
    let response = await upstream(path, tokens, init);
    if (response.status === 401) {
      tokens = await refreshTokens(tokens);
      await saveSession(tokens, userId, request);
      response = await upstream(path, tokens, init);
    }
    await checkResponse(response);
    if (response.status === 204) return null;
    const text = await response.text();
    if (text.length === 0) return null;
    return JSON.parse(text);
  };
}
