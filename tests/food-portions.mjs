import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["lib/food-portions.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const bytes = Buffer.from(built.outputFiles[0].text);
const encoded = bytes.toString("base64");
const moduleUrl = `data:text/javascript;base64,${encoded}`;
const { foodUnits, createFoodPortion, changeFoodQuantity, changeFoodUnit } =
  await import(moduleUrl);

const cheese = {
  name: "Example cheese",
  base_unit: "g",
  nutrients: { "energy.energy": 3.86 },
  servings: [
    { serving: "portion", amount: 40 },
    { serving: "slice.small", amount: 15 },
    { serving: "slice", amount: 30 },
  ],
};

test("API portion sizes supply readable choices beside the base unit", () => {
  const units = foodUnits(cheese);
  assert.deepEqual(units, [
    { label: "g", amount: 1, serving: null },
    { label: "Portion (40 g)", amount: 40, serving: "portion" },
    { label: "Small slice (15 g)", amount: 15, serving: "slice.small" },
    { label: "Slice (30 g)", amount: 30, serving: "slice" },
  ]);
});

test("repeated unit changes retain the exact food amount and calories", () => {
  const units = foodUnits(cheese);
  let portion = createFoodPortion(100);
  for (let index = 0; index < 20; index++) {
    portion = changeFoodUnit(portion, units[3], 3);
    assert.equal(portion.amount, 100);
    portion = changeFoodUnit(portion, units[0], 0);
  }
  assert.equal(portion.quantity, "100");
  assert.equal(portion.amount, 100);
  const energy = portion.amount * cheese.nutrients["energy.energy"];
  assert.equal(energy, 386);
  const maximum = createFoodPortion(100000);
  const smallSlices = changeFoodUnit(maximum, units[2], 2);
  const displayedQuantity = Number(smallSlices.quantity);
  assert.equal(displayedQuantity, 100000 / 15);
});

test("fractional portions use the product's conversion amount", () => {
  const units = foodUnits(cheese);
  const initial = createFoodPortion(100);
  const slices = changeFoodUnit(initial, units[3], 3);
  const portion = changeFoodQuantity(slices, units[3], "1.5");
  assert.equal(portion.amount, 45);
  const grams = changeFoodUnit(portion, units[0], 0);
  assert.equal(grams.quantity, "45");
  const energy = portion.amount * cheese.nutrients["energy.energy"];
  assert.equal(energy, 173.7);
});

test("liquid portions use millilitres without assuming gram equivalence", () => {
  const drink = {
    ...cheese,
    base_unit: "ml",
    servings: [{ serving: "glass", amount: 250 }],
  };
  const units = foodUnits(drink);
  const initial = createFoodPortion(125);
  const glass = changeFoodUnit(initial, units[1], 1);
  assert.equal(glass.quantity, "0.5");
  const portion = changeFoodQuantity(glass, units[1], "1.5");
  assert.equal(portion.amount, 375);
});

test("a food without usable alternative portions only offers its base unit", () => {
  const product = {
    ...cheese,
    servings: [{ serving: "portion", amount: 0 }],
  };
  const units = foodUnits(product);
  assert.deepEqual(units, [{ label: "g", amount: 1, serving: null }]);
});
