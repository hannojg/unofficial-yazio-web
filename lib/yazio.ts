import { z } from "zod";

export const API_BASE = "https://yzapi.yazio.com/v22";
export const USER_AGENT = "YAZIO/26.28.0 (com.yazio.android; build:607100145; Android 35) Ktor";
export const tokenSchema = z.object({
  access_token: z.string().min(10).max(2000),
  refresh_token: z.string().min(10).max(2000),
});
export type Tokens = z.infer<typeof tokenSchema>;
export const profileSchema = z.object({
  first_name: z.string(), sex: z.string(), country: z.string(),
  food_database_country: z.string().optional(), language: z.string(), unit_energy: z.string(),
});
export const nutrientsSchema = z.record(z.number());
export const productSchema = z.object({
  name: z.string(), producer: z.string().nullable().optional(), base_unit: z.string(),
  nutrients: nutrientsSchema,
  servings: z.array(z.object({ serving: z.string(), amount: z.number() })),
});
export const searchSchema = z.array(z.object({
  product_id: z.string(), name: z.string(), producer: z.string().nullable().optional(), is_verified: z.boolean().optional(),
}));
export const mealNames = ["breakfast", "lunch", "dinner", "snack"] as const;
export const mealSchema = z.enum(mealNames);
export type MealName = z.infer<typeof mealSchema>;
const mealSummarySchema = z.object({ nutrients: nutrientsSchema, energy_goal: z.number() });
export const summarySchema = z.object({
  activity_energy: z.number(), consume_activity_energy: z.boolean(), water_intake: z.number(),
  goals: z.record(z.number()), meals: z.record(mealSummarySchema), units: z.object({ unit_energy: z.string() }),
});
const consumedProductSchema = z.object({
  id: z.string(), product_id: z.string(), amount: z.number(), daytime: z.string(), serving: z.string().nullable().optional(),
});
const consumedRecipeSchema = z.object({
  id: z.string(), recipe_id: z.string(), daytime: z.string(), portion_count: z.number(),
});
const simpleSchema = z.object({
  id: z.string(), daytime: z.string(), name: z.string(), nutrients: nutrientsSchema,
});
export const diarySchema = z.object({
  products: z.array(consumedProductSchema), recipe_portions: z.array(consumedRecipeSchema), simple_products: z.array(simpleSchema),
});
export type Profile = z.infer<typeof profileSchema>;
export type Product = z.infer<typeof productSchema>;
export type SearchProduct = z.infer<typeof searchSchema>[number];
export type Summary = z.infer<typeof summarySchema>;
export type Entry = {
  id: string; bucket: "products" | "recipe_portions" | "simple_products";
  meal: string; name: string; description: string; energy: number | null;
};
export type Day = { summary: Summary; entries: Entry[] };

export class ApiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function upstream(path: string, tokens: Tokens, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);
  headers.set("User-Agent", USER_AGENT);
  headers.set("Accept-Language", "en");
  headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(20000);
  return fetch(`${API_BASE}${path}`, { ...init, headers, signal: timeout, cache: "no-store" });
}

export async function checkResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401) throw new ApiError("Your YAZIO session expired. Reconnect your account.", 401);
  if (response.status === 403) throw new ApiError("YAZIO rejected this client. Its private API may have changed.");
  if (response.status === 429) throw new ApiError("YAZIO is receiving too many requests. Please try again shortly.", 429);
  throw new ApiError(`YAZIO returned HTTP ${response.status}. No change has been confirmed.`, response.status);
}

export async function refreshTokens(tokens: Tokens) {
  const body = JSON.stringify({ grant_type: "refresh_token", refresh_token: tokens.refresh_token,
    client_id: "7_9236kdzucvnd624cklgz787kcvhjfch6sbdejgmdv8387fj7v" });
  const signal = AbortSignal.timeout(20000);
  const response = await fetch("https://www.yazio.com/api/auth/token", {
    method: "POST", headers: { "Content-Type": "application/json", "x-client-type": "web" },
    body, signal, cache: "no-store",
  });
  await checkResponse(response);
  const json = await response.json();
  return tokenSchema.parse(json);
}
