import type { Product } from "./yazio";

export type FoodUnit = {
  label: string;
  amount: number;
  serving: string | null;
};

export type FoodPortion = {
  quantity: string;
  amount: number;
  unitIndex: number;
};

function servingLabel(serving: string) {
  const [name, ...modifiers] = serving.split(".");
  modifiers.reverse();
  modifiers.push(name);
  const words = modifiers.join(" ");
  const spaced = words.replaceAll("_", " ");
  const label = spaced.replaceAll("extralarge", "extra large");
  const first = label.charAt(0);
  const initial = first.toUpperCase();
  const rest = label.slice(1);
  return `${initial}${rest}`;
}

export function foodUnits(product: Product): FoodUnit[] {
  const units: FoodUnit[] = [
    { label: product.base_unit, amount: 1, serving: null },
  ];
  for (const serving of product.servings) {
    if (serving.amount <= 0) continue;
    const name = servingLabel(serving.serving);
    const amount = serving.amount.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
    units.push({
      label: `${name} (${amount} ${product.base_unit})`,
      amount: serving.amount,
      serving: serving.serving,
    });
  }
  return units;
}

export function createFoodPortion(amount: number): FoodPortion {
  const quantity = String(amount);
  return { quantity, amount, unitIndex: 0 };
}

export function changeFoodQuantity(
  portion: FoodPortion,
  unit: FoodUnit,
  quantity: string,
): FoodPortion {
  const value = Number(quantity);
  const amount = value * unit.amount;
  return { ...portion, quantity, amount };
}

export function changeFoodUnit(
  portion: FoodPortion,
  unit: FoodUnit,
  unitIndex: number,
): FoodPortion {
  const value = portion.amount / unit.amount;
  const quantity = portion.quantity === "" ? "" : String(value);
  return { ...portion, quantity, unitIndex };
}
