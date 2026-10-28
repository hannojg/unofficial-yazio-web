import { z } from "zod";
import { mealSchema } from "../lib/yazio";
import type { Day, Product, Profile, SearchProduct } from "../lib/yazio";
import type { RecentProduct } from "../lib/recent-products";

const text = z.string();
const date = text.regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = text.uuid();
const numeric = z.number();
const positive = numeric.positive();
const amount = positive.max(100000);
const nonnegative = numeric.min(0);
const water = nonnegative.max(20000);
const minimumQuery = text.min(2);
const query = minimumQuery.max(160);
const bucket = z.enum(["products", "recipe_portions", "simple_products"]);

function command<T extends string, S extends z.ZodRawShape>(
  name: T,
  fields: S,
) {
  const type = z.literal(name);
  return z.object({ type, ...fields });
}
const sessionCommand = command("session", {});
const connectCommand = command("connect", {});
const cancelCommand = command("cancel-pair", {});
const disconnectCommand = command("disconnect", {});
const dayCommand = command("day", { date });
const recentsCommand = command("recents", {});
const searchCommand = command("search", { query });
const productCommand = command("product", { productId: uuid });
const addCommand = command("add-entry", {
  productId: uuid,
  amount,
  meal: mealSchema,
  date,
});
const removeCommand = command("remove-entry", { id: uuid, bucket });
const waterCommand = command("water", { date, amountMl: water });
export const commandSchema = z.discriminatedUnion("type", [
  sessionCommand,
  connectCommand,
  cancelCommand,
  disconnectCommand,
  dayCommand,
  recentsCommand,
  searchCommand,
  productCommand,
  addCommand,
  removeCommand,
  waterCommand,
]);

export type Command = z.infer<typeof commandSchema>;
export type DiaryCommand = Exclude<
  Command,
  { type: "session" | "connect" | "cancel-pair" | "disconnect" }
>;
export type Session = {
  connected: boolean;
  profile?: Profile;
  pairingExpires?: number;
};
export type Results = {
  session: Session;
  connect: { expires: number };
  "cancel-pair": null;
  disconnect: null;
  day: Day;
  recents: RecentProduct[];
  search: SearchProduct[];
  product: Product;
  "add-entry": { saved: true };
  "remove-entry": { removed: true };
  water: { saved: true };
};
export type Reply<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };
export type DeskEvent =
  | { kind: "ND_SESSION_CHANGED" }
  | { kind: "ND_PAIR_ERROR"; error: string };
