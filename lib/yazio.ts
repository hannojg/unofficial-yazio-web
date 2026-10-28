import { z } from "zod";

export const API_BASE = "https://yzapi.yazio.com/v22";
const text = z.string();
const numeric = z.number();
const boolean = z.boolean();
const minimumToken = text.min(10);
const tokenValue = minimumToken.max(2000);
const optionalText = text.optional();
const nullableText = text.nullable();
const optionalNullableText = nullableText.optional();
const optionalBoolean = boolean.optional();
export const tokenSchema = z.object({
  access_token: tokenValue,
  refresh_token: tokenValue,
});
export type Tokens = z.infer<typeof tokenSchema>;
export const profileSchema = z.object({
  first_name: text,
  sex: text,
  country: text,
  food_database_country: optionalText,
  language: text,
  unit_energy: text,
});
export const nutrientsSchema = z.record(numeric);
const servingSchema = z.object({ serving: text, amount: numeric });
const servingsSchema = z.array(servingSchema);
export const productSchema = z.object({
  name: text,
  producer: optionalNullableText,
  base_unit: text,
  nutrients: nutrientsSchema,
  servings: servingsSchema,
});
const searchProductSchema = z.object({
  product_id: text,
  name: text,
  producer: optionalNullableText,
  is_verified: optionalBoolean,
});
export const searchSchema = z.array(searchProductSchema);
export const mealNames = ["breakfast", "lunch", "dinner", "snack"] as const;
export const mealSchema = z.enum(mealNames);
export type MealName = z.infer<typeof mealSchema>;
const mealSummarySchema = z.object({
  nutrients: nutrientsSchema,
  energy_goal: numeric,
});
const mealSummariesSchema = z.record(mealSummarySchema);
const unitsSchema = z.object({ unit_energy: text });
export const summarySchema = z.object({
  activity_energy: numeric,
  consume_activity_energy: boolean,
  water_intake: numeric,
  goals: nutrientsSchema,
  meals: mealSummariesSchema,
  units: unitsSchema,
});
const consumedProductSchema = z.object({
  id: text,
  product_id: text,
  amount: numeric,
  daytime: text,
  serving: optionalNullableText,
});
const consumedRecipeSchema = z.object({
  id: text,
  recipe_id: text,
  daytime: text,
  portion_count: numeric,
});
const simpleSchema = z.object({
  id: text,
  daytime: text,
  name: text,
  nutrients: nutrientsSchema,
});
const productsSchema = z.array(consumedProductSchema);
const recipesSchema = z.array(consumedRecipeSchema);
const simplesSchema = z.array(simpleSchema);
export const diarySchema = z.object({
  products: productsSchema,
  recipe_portions: recipesSchema,
  simple_products: simplesSchema,
});
export type Profile = z.infer<typeof profileSchema>;
export type Product = z.infer<typeof productSchema>;
export type SearchProduct = z.infer<typeof searchSchema>[number];
export type Summary = z.infer<typeof summarySchema>;
export type Entry = {
  id: string;
  bucket: "products" | "recipe_portions" | "simple_products";
  meal: string;
  name: string;
  description: string;
  energy: number | null;
};
export type Day = { summary: Summary; entries: Entry[] };

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function upstream(
  path: string,
  tokens: Tokens,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);
  headers.set("Accept-Language", "en");
  headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(20000);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    signal: timeout,
    cache: "no-store",
    credentials: "omit",
  });
}

export async function checkResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401)
    throw new ApiError(
      "Your YAZIO session expired. Reconnect your account.",
      401,
    );
  if (response.status === 403) {
    throw new ApiError(
      "YAZIO rejected this client. Its private API may have changed.",
    );
  }
  if (response.status === 429)
    throw new ApiError(
      "YAZIO is receiving too many requests. Please try again shortly.",
      429,
    );
  throw new ApiError(
    `YAZIO returned HTTP ${response.status}. No change has been confirmed.`,
    response.status,
  );
}

export async function refreshTokens(tokens: Tokens) {
  const body = JSON.stringify({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: "7_9236kdzucvnd624cklgz787kcvhjfch6sbdejgmdv8387fj7v",
  });
  const signal = AbortSignal.timeout(20000);
  const response = await fetch("https://www.yazio.com/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-type": "web" },
    body,
    signal,
    cache: "no-store",
    credentials: "omit",
  });
  await checkResponse(response);
  const json = await response.json();
  return tokenSchema.parse(json);
}
