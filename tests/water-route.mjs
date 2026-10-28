import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import path from "node:path";

const routePath = path.resolve("app/api/[...path]/route.ts");
const built = await build({
  stdin: {
    contents: `export { POST } from ${JSON.stringify(routePath)}; export { calls } from "fixture-session";`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolated-session",
      setup(builder) {
        builder.onResolve(
          { filter: /(?:lib\/session|fixture-session)$/ },
          () => ({ path: "session", namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `
        export const calls = [];
        export async function identity() { return "test-user"; }
        export function assertOrigin() {}
        export async function client() { return async (path, init) => { calls.push({ path, init }); return null; }; }
        export async function beginPair() {}
        export async function clearSession() {}
        export async function saveSession() {}
        export async function verifyPair() {}
      `,
        }));
      },
    },
  ],
});
const bytes = Buffer.from(built.outputFiles[0].text);
const encoded = bytes.toString("base64");
const moduleUrl = `data:text/javascript;base64,${encoded}`;
const { POST, calls } = await import(moduleUrl);

async function send(value) {
  const body = JSON.stringify(value);
  const request = new Request("https://desk.example/api/water", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://desk.example",
    },
    body,
  });
  return POST(request);
}

test("a 250 ml increment is accepted and sent upstream as 250 millilitres", async () => {
  calls.length = 0;
  const response = await send({ date: "2026-10-28", amountMl: 250 });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/user/water-intake");
  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload, [{ date: "2026-10-28", water_intake: 250 }]);
});

test("existing intake remains in millilitres when writing the cumulative total", async () => {
  calls.length = 0;
  const response = await send({ date: "2026-10-28", amountMl: 1250 });
  assert.equal(response.status, 200);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload[0].water_intake, 1250);
});

test("the obsolete ambiguous amount field cannot write a fractional litre value", async () => {
  calls.length = 0;
  const response = await send({ date: "2026-10-28", amount: 0.25 });
  assert.equal(response.status, 422);
  assert.equal(calls.length, 0);
});
