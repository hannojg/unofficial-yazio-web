import { z } from "zod";
import { productSchema } from "./yazio";
import type { Product } from "./yazio";

const text = z.string();
const numeric = z.number();
const productType = z.literal("product");
const recipeType = z.literal("recipe_portion");
const simpleType = z.literal("simple_product");
const productHistorySchema = z.object({
  type: productType,
  product_id: text,
  amount: numeric,
  date: text,
  daytime: text,
});
const recipeHistorySchema = z.object({ type: recipeType, date: text });
const simpleHistorySchema = z.object({ type: simpleType, date: text });
const historyItemSchema = z.discriminatedUnion("type", [
  productHistorySchema,
  recipeHistorySchema,
  simpleHistorySchema,
]);
const historySchema = z.array(historyItemSchema);
type ProductHistory = z.infer<typeof productHistorySchema>;
export type RecentProduct = {
  product_id: string;
  amount: number;
  last_used: string;
  product: Product;
};

type ReadApi = (path: string) => Promise<unknown>;

export async function loadRecentProducts(
  api: ReadApi,
): Promise<RecentProduct[]> {
  const raw = await api("/user/consumed-items/latest?limit=500");
  const history = historySchema.parse(raw);
  const products = history.filter(
    (item): item is ProductHistory => item.type === "product",
  );
  products.sort((left, right) => right.date.localeCompare(left.date));
  const seen = new Set<string>();
  const unique: ProductHistory[] = [];
  for (const item of products) {
    if (seen.has(item.product_id)) continue;
    seen.add(item.product_id);
    unique.push(item);
    if (unique.length === 40) break;
  }

  const results: RecentProduct[] = [];
  for (let index = 0; index < unique.length; index += 5) {
    const batch = unique.slice(index, index + 5);
    const pending = batch.map(async (item) => {
      const rawProduct = await api(`/products/${item.product_id}`);
      const product = productSchema.parse(rawProduct);
      return {
        product_id: item.product_id,
        amount: item.amount,
        last_used: item.date,
        product,
      };
    });
    const details = await Promise.all(pending);
    results.push(...details);
  }
  return results;
}
