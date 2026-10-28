import type { Summary } from "./yazio";

export function daySummary(summary: Summary) {
  const totals: Record<string, number> = {};
  const meals = Object.values(summary.meals);
  for (const meal of meals) {
    const nutrients = Object.entries(meal.nutrients);
    for (const [key, value] of nutrients) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  const eaten = totals["energy.energy"] ?? 0;
  const goal = summary.goals["energy.energy"] ?? 0;
  const burned = summary.activity_energy;
  // The widget includes activity in its energy goal, but returns base macro goals.
  const includedActivity = summary.consume_activity_energy ? burned : 0;
  const baseGoal = goal - includedActivity;
  const macroScale = baseGoal > 0 ? goal / baseGoal : 1;
  const targets = { ...summary.goals };
  for (const key of ["nutrient.carb", "nutrient.protein", "nutrient.fat"]) {
    const baseTarget = targets[key] ?? 0;
    targets[key] = baseTarget * macroScale;
  }
  const remaining = goal - eaten;
  const filled = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  return { totals, targets, eaten, goal, burned, remaining, filled };
}
