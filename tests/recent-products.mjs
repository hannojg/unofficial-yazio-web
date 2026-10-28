import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["lib/recent-products.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const bytes = Buffer.from(built.outputFiles[0].text);
const encoded = bytes.toString("base64");
const moduleUrl = `data:text/javascript;base64,${encoded}`;
const { loadRecentProducts } = await import(moduleUrl);
const product = {
  name: "Test oats",
  producer: "Test",
  base_unit: "g",
  nutrients: { "energy.energy": 3.8 },
  servings: [{ serving: "portion", amount: 50 }],
};
const oats = "11111111-1111-4111-8111-111111111111";
const yogurt = "22222222-2222-4222-8222-222222222222";
const history = [
  {
    type: "product",
    product_id: oats,
    amount: 40,
    daytime: "breakfast",
    date: "2026-10-25 08:00:00",
  },
  { type: "recipe_portion", date: "2026-10-28 12:00:00" },
  {
    type: "product",
    product_id: yogurt,
    amount: 150,
    daytime: "snack",
    date: "2026-10-27 15:00:00",
  },
  { type: "simple_product", date: "2026-10-28 13:00:00" },
  {
    type: "product",
    product_id: oats,
    amount: 65,
    daytime: "dinner",
    date: "2026-10-28 18:00:00",
  },
];

test("recents come from synced history, newest first, with one row per food and its last quantity", async () => {
  const paths = [];
  async function api(path) {
    paths.push(path);
    if (path === "/user/consumed-items/latest?limit=500") return history;
    return product;
  }
  const results = await loadRecentProducts(api);
  assert.equal(results.length, 2);
  assert.equal(results[0].product_id, oats);
  assert.equal(results[0].amount, 65);
  assert.equal(results[0].last_used, "2026-10-28 18:00:00");
  assert.equal(results[1].product_id, yogurt);
  assert.equal(results[1].amount, 150);
  assert.equal(paths.length, 3);
  assert.equal(results[0].product.name, "Test oats");
});

test("an empty synced history is an empty list without detail requests", async () => {
  let calls = 0;
  async function api() {
    calls++;
    return [];
  }
  const results = await loadRecentProducts(api);
  assert.deepEqual(results, []);
  assert.equal(calls, 1);
});

test("an unknown history type is reported rather than silently replaced", async () => {
  async function api() {
    return [{ type: "unexpected", date: "2026-10-28 18:00:00" }];
  }
  await assert.rejects(() => loadRecentProducts(api));
});

test("an upstream error does not present a partial recents list", async () => {
  async function api(path) {
    if (path === "/user/consumed-items/latest?limit=500") return history;
    throw new Error("upstream unavailable");
  }
  await assert.rejects(() => loadRecentProducts(api), /upstream unavailable/);
});
