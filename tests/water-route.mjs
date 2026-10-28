import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const directory = process.cwd();
const built = await build({
  stdin: {
    contents:
      'export { runDiaryCommand } from "./lib/diary"; export { commandSchema } from "./extension/messages";',
    resolveDir: directory,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const bytes = Buffer.from(built.outputFiles[0].text);
const encoded = bytes.toString("base64");
const moduleUrl = `data:text/javascript;base64,${encoded}`;
const { runDiaryCommand, commandSchema } = await import(moduleUrl);
const calls = [];

async function send(value) {
  const command = commandSchema.parse({ type: "water", ...value });
  return runDiaryCommand(command, async (path, init) => {
    calls.push({ path, init });
    return null;
  });
}

test("a 250 ml increment is sent upstream as 250 millilitres", async () => {
  calls.length = 0;
  const response = await send({ date: "2026-10-28", amountMl: 250 });
  assert.deepEqual(response, { saved: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/user/water-intake");
  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload, [{ date: "2026-10-28", water_intake: 250 }]);
});

test("existing intake remains in millilitres when writing the cumulative total", async () => {
  calls.length = 0;
  await send({ date: "2026-10-28", amountMl: 1250 });
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload[0].water_intake, 1250);
});

test("the obsolete ambiguous amount field cannot write a fractional litre value", async () => {
  calls.length = 0;
  await assert.rejects(() => send({ date: "2026-10-28", amount: 0.25 }));
  assert.equal(calls.length, 0);
});

const food = "11111111-1111-4111-8111-111111111111";
test("food additions preserve quantity, meal, and YAZIO's timestamp format", async () => {
  calls.length = 0;
  const command = commandSchema.parse({
    type: "add-entry",
    productId: food,
    amount: 160,
    meal: "lunch",
    date: "2026-10-28",
  });
  await runDiaryCommand(command, async (path, init) => {
    calls.push({ path, init });
  });
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(payload.products[0].product_id, food);
  assert.equal(payload.products[0].amount, 160);
  assert.equal(payload.products[0].daytime, "lunch");
  assert.equal(payload.products[0].date, "2026-10-28 12:00:00");
  assert.match(payload.products[0].id, /^[0-9a-f-]{36}$/);
});

test("removing an entry sends a single UUID in the requested bucket", async () => {
  calls.length = 0;
  const command = commandSchema.parse({
    type: "remove-entry",
    id: food,
    bucket: "products",
  });
  await runDiaryCommand(command, async (path, init) => {
    calls.push({ path, init });
  });
  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload, { products: food });
  assert.equal(calls[0].init.method, "DELETE");
});
