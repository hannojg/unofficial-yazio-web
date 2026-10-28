import { z } from "zod";
import {
  ApiError,
  checkResponse,
  diarySchema,
  mealSchema,
  productSchema,
  profileSchema,
  searchSchema,
  summarySchema,
  tokenSchema,
  upstream,
} from "../../../lib/yazio";
import type { Entry } from "../../../lib/yazio";
import {
  assertOrigin,
  beginPair,
  clearSession,
  client,
  identity,
  saveSession,
  verifyPair,
} from "../../../lib/session";

export const dynamic = "force-dynamic";
const text = z.string();
const numeric = z.number();
const dateSchema = text.regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = text.uuid();
const positiveAmount = numeric.positive();
const foodAmountSchema = positiveAmount.max(100000);
const nonNegativeAmount = numeric.min(0);
const waterAmountSchema = nonNegativeAmount.max(20);
const minimumQuery = text.min(2);
const querySchema = minimumQuery.max(160);
const bucketSchema = z.enum(["products", "recipe_portions", "simple_products"]);
const connectSchema = tokenSchema.extend({ nonce: uuidSchema });
const entrySchema = z.object({
  productId: uuidSchema,
  amount: foodAmountSchema,
  meal: mealSchema,
  date: dateSchema,
});
const deletionSchema = z.object({ id: uuidSchema, bucket: bucketSchema });
const waterSchema = z.object({ date: dateSchema, amount: waterAmountSchema });
const recipeSchema = z.object({ name: text });

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    await identity();
    if (request.method === "POST") assertOrigin(request);
    if (request.method === "DELETE") assertOrigin(request);
    if (path === "/api/connect" && request.method === "POST") {
      const nonce = await beginPair(request);
      return json({ nonce });
    }
    if (path === "/api/session" && request.method === "POST") {
      const body = await request.json();
      const tokens = connectSchema.parse(body);
      const userId = await verifyPair(request, tokens.nonce);
      const response = await upstream("/user", tokens);
      await checkResponse(response);
      const rawProfile = await response.json();
      const profile = profileSchema.parse(rawProfile);
      await saveSession(tokens, userId, request);
      return json({ connected: true, profile });
    }
    if (path === "/api/session" && request.method === "DELETE") {
      await clearSession();
      return json({ connected: false });
    }
    const api = await client(request);
    if (path === "/api/session" && request.method === "GET") {
      if (!api) return json({ connected: false });
      const rawProfile = await api("/user");
      const profile = profileSchema.parse(rawProfile);
      return json({ connected: true, profile });
    }
    if (!api) throw new ApiError("Connect your YAZIO account first.", 401);
    if (path === "/api/day" && request.method === "GET") {
      const dateParameter = url.searchParams.get("date");
      const date = dateSchema.parse(dateParameter);
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
      return json({ summary, entries });
    }
    if (path === "/api/search" && request.method === "GET") {
      const queryParameter = url.searchParams.get("q");
      const query = querySchema.parse(queryParameter);
      const rawProfile = await api("/user");
      const profile = profileSchema.parse(rawProfile);
      const params = new URLSearchParams({
        query,
        sex: profile.sex,
        countries: profile.food_database_country ?? profile.country,
        locales: profile.language,
      });
      const rawResults = await api(`/products/search?${params}`);
      const results = searchSchema.parse(rawResults);
      const visibleResults = results.slice(0, 30);
      return json(visibleResults);
    }
    if (path.startsWith("/api/product/") && request.method === "GET") {
      const idParameter = path.slice(13);
      const id = uuidSchema.parse(idParameter);
      const raw = await api(`/products/${id}`);
      const product = productSchema.parse(raw);
      return json(product);
    }
    if (path === "/api/entries" && request.method === "POST") {
      const raw = await request.json();
      const entry = entrySchema.parse(raw);
      const id = crypto.randomUUID();
      const body = JSON.stringify({
        products: [
          {
            id,
            product_id: entry.productId,
            amount: entry.amount,
            daytime: entry.meal,
            date: `${entry.date} 12:00:00`,
            serving: null,
            serving_quantity: null,
          },
        ],
      });
      await api("/user/consumed-items", { method: "POST", body });
      return json({ saved: true });
    }
    if (path === "/api/entries" && request.method === "DELETE") {
      const raw = await request.json();
      const entry = deletionSchema.parse(raw);
      const body = JSON.stringify({ [entry.bucket]: entry.id });
      await api("/user/consumed-items", { method: "DELETE", body });
      return json({ removed: true });
    }
    if (path === "/api/water" && request.method === "POST") {
      const raw = await request.json();
      const water = waterSchema.parse(raw);
      const body = JSON.stringify([
        { date: water.date, water_intake: water.amount },
      ]);
      await api("/user/water-intake", { method: "POST", body });
      return json({ saved: true });
    }
    return json({ error: "Unknown endpoint." }, 404);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        {
          error:
            "The data format did not match the expected YAZIO API. No change has been confirmed.",
        },
        422,
      );
    return json(
      {
        error:
          "The request could not be completed. Check your connection and try again.",
      },
      502,
    );
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
