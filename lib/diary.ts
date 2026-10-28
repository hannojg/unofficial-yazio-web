import { z } from "zod";
import {
  diarySchema,
  productSchema,
  profileSchema,
  searchSchema,
  summarySchema,
} from "./yazio";
import type { Day, Entry } from "./yazio";
import type { DiaryCommand } from "../extension/messages";
import type { YazioApi } from "../extension/session";
import { loadRecentProducts } from "./recent-products";

const text = z.string();
const recipeSchema = z.object({ name: text });

async function loadDay(api: YazioApi, date: string): Promise<Day> {
  const rawSummary = await api(`/user/widgets/daily-summary?date=${date}`);
  const summary = summarySchema.parse(rawSummary);
  const rawDiary = await api(`/user/consumed-items?date=${date}`);
  const diary = diarySchema.parse(rawDiary);
  const entries: Entry[] = [];
  const details = new Map<string, z.infer<typeof productSchema>>();
  for (const item of diary.products) {
    let detail = details.get(item.product_id);
    if (!detail) {
      const raw = await api(`/products/${item.product_id}`);
      detail = productSchema.parse(raw);
      details.set(item.product_id, detail);
    }
    const energyPerUnit = detail.nutrients["energy.energy"] ?? 0;
    entries.push({
      id: item.id,
      bucket: "products",
      meal: item.daytime,
      name: detail.name,
      description: `${item.amount} ${detail.base_unit}`,
      energy: energyPerUnit * item.amount,
    });
  }
  for (const item of diary.recipe_portions) {
    const raw = await api(`/recipes/${item.recipe_id}`);
    const recipe = recipeSchema.parse(raw);
    entries.push({
      id: item.id,
      bucket: "recipe_portions",
      meal: item.daytime,
      name: recipe.name,
      description: `${item.portion_count} portions`,
      energy: null,
    });
  }
  for (const item of diary.simple_products) {
    entries.push({
      id: item.id,
      bucket: "simple_products",
      meal: item.daytime,
      name: item.name,
      description: "Quick entry",
      energy: item.nutrients["energy.energy"] ?? null,
    });
  }
  return { summary, entries };
}

export async function runDiaryCommand(command: DiaryCommand, api: YazioApi) {
  switch (command.type) {
    case "day":
      return loadDay(api, command.date);
    case "recents":
      return loadRecentProducts(api);
    case "search": {
      const rawProfile = await api("/user");
      const profile = profileSchema.parse(rawProfile);
      const params = new URLSearchParams({
        query: command.query,
        sex: profile.sex,
        countries: profile.food_database_country ?? profile.country,
        locales: profile.language,
      });
      const rawResults = await api(`/products/search?${params}`);
      const results = searchSchema.parse(rawResults);
      return results.slice(0, 30);
    }
    case "product": {
      const raw = await api(`/products/${command.productId}`);
      return productSchema.parse(raw);
    }
    case "add-entry": {
      const id = crypto.randomUUID();
      const body = JSON.stringify({
        products: [
          {
            id,
            product_id: command.productId,
            amount: command.amount,
            daytime: command.meal,
            date: `${command.date} 12:00:00`,
            serving: command.portion?.serving ?? null,
            serving_quantity: command.portion?.quantity ?? null,
          },
        ],
      });
      await api("/user/consumed-items", { method: "POST", body });
      return { saved: true };
    }
    case "remove-entry": {
      const body = JSON.stringify({ [command.bucket]: command.id });
      await api("/user/consumed-items", { method: "DELETE", body });
      return { removed: true };
    }
    case "water": {
      const body = JSON.stringify([
        { date: command.date, water_intake: command.amountMl },
      ]);
      await api("/user/water-intake", { method: "POST", body });
      return { saved: true };
    }
  }
}
