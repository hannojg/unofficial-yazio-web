import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["lib/day-summary.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const bytes = Buffer.from(built.outputFiles[0].text);
const encoded = bytes.toString("base64");
const moduleUrl = `data:text/javascript;base64,${encoded}`;
const { daySummary } = await import(moduleUrl);
const summary = {
  activity_energy: 200,
  consume_activity_energy: true,
  water_intake: 0,
  goals: {
    "energy.energy": 2200,
    "nutrient.carb": 200,
    "nutrient.protein": 100,
    "nutrient.fat": 50,
    water: 2000,
  },
  meals: {
    breakfast: { nutrients: { "energy.energy": 500 }, energy_goal: 660 },
    lunch: { nutrients: { "energy.energy": 300 }, energy_goal: 880 },
  },
  units: { unit_energy: "kcal" },
};

test("the activity-adjusted API budget counts burned calories once", () => {
  const result = daySummary(summary);
  assert.equal(result.eaten, 800);
  assert.equal(result.burned, 200);
  assert.equal(result.goal, 2200);
  assert.equal(result.remaining, 1400);
  assert.equal(result.filled, 800 / 2200);
  const carbs = Math.round(result.targets["nutrient.carb"]);
  const protein = Math.round(result.targets["nutrient.protein"]);
  const fat = Math.round(result.targets["nutrient.fat"]);
  assert.equal(carbs, 220);
  assert.equal(protein, 110);
  assert.equal(fat, 55);
  assert.equal(summary.goals["nutrient.carb"], 200);
});

test("disabled activity accounting still displays burned calories with fixed macro goals", () => {
  const fixed = {
    ...summary,
    consume_activity_energy: false,
    goals: { ...summary.goals, "energy.energy": 2000 },
  };
  const result = daySummary(fixed);
  assert.equal(result.burned, 200);
  assert.equal(result.remaining, 1200);
  assert.equal(result.filled, 0.4);
  assert.equal(result.targets["nutrient.carb"], 200);
  assert.equal(result.targets["nutrient.protein"], 100);
  assert.equal(result.targets["nutrient.fat"], 50);
});

test("above-goal intake keeps its signed balance and caps the progress ring", () => {
  const over = {
    ...summary,
    meals: { dinner: { nutrients: { "energy.energy": 2400 }, energy_goal: 2200 } },
  };
  const result = daySummary(over);
  assert.equal(result.remaining, -200);
  assert.equal(result.filled, 1);
});

test("a zero calorie goal produces finite macro targets and progress", () => {
  const empty = {
    ...summary,
    activity_energy: 0,
    goals: { "energy.energy": 0 },
    meals: {},
  };
  const result = daySummary(empty);
  assert.equal(result.remaining, 0);
  assert.equal(result.filled, 0);
  assert.equal(result.targets["nutrient.carb"], 0);
});
