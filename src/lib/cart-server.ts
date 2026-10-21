import { z } from "zod";
import { db } from "@/lib/db";
import { productImageUrl } from "@/lib/s3";
import { redisCommand } from "@/lib/redis";

const CART_TTL_SECONDS = 60 * 60 * 24 * 30;
const cartInputSchema = z.array(z.object({ productId: z.string().min(1).max(40), qty: z.number().int().min(1).max(1000) })).max(100);

export type CartInput = z.infer<typeof cartInputSchema>;
export type ServerCartItem = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  shop: string;
  stock: number;
  qty: number;
};

function cartKey(userId: string) {
  return `cart:user:${userId}`;
}

function aggregateCart(input: CartInput) {
  const quantities = new Map<string, number>();
  for (const item of input) quantities.set(item.productId, Math.min(1000, (quantities.get(item.productId) ?? 0) + item.qty));
  return [...quantities].map(([productId, qty]) => ({ productId, qty }));
}

async function resolveCart(input: CartInput): Promise<ServerCartItem[]> {
  const lines = aggregateCart(input);
  if (!lines.length) return [];
  const products = await db.product.findMany({ where: { id: { in: lines.map((line) => line.productId) }, vendor: { approved: true } }, include: { vendor: { select: { shopName: true } } } });
  const byId = new Map(products.map((product) => [product.id, product]));
  return lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || product.stock < 1) return [];
    return [{
      id: product.id,
      title: product.title,
      price: Number(product.price),
      image: product.image?.startsWith("products/") ? productImageUrl(product.image) : null,
      shop: product.vendor.shopName,
      stock: product.stock,
      qty: Math.min(line.qty, product.stock),
    }];
  });
}

async function persistCart(userId: string, input: CartInput) {
  const items = await resolveCart(input);
  const result = await redisCommand(async (client) => {
    const key = cartKey(userId);
    const transaction = client.multi().del(key);
    if (items.length) {
      transaction.hSet(key, Object.fromEntries(items.map((item) => [item.id, String(item.qty)])));
      transaction.expire(key, CART_TTL_SECONDS);
    }
    await transaction.exec();
    return items;
  });
  return result;
}

export async function readSignedInCart(userId: string): Promise<{ available: boolean; items: ServerCartItem[] }> {
  const hash = await redisCommand(async (client) => client.hGetAll(cartKey(userId)));
  if (hash === undefined) return { available: false, items: [] };
  const input = Object.entries(hash).flatMap(([productId, rawQty]) => {
    const parsedQty = z.coerce.number().int().min(1).max(1000).safeParse(rawQty);
    return parsedQty.success ? [{ productId, qty: parsedQty.data }] : [];
  });
  if (input.length) await redisCommand((client) => client.expire(cartKey(userId), CART_TTL_SECONDS));
  return { available: true, items: await resolveCart(input) };
}

export async function replaceSignedInCart(userId: string, value: unknown) {
  const parsed = cartInputSchema.safeParse(value);
  if (!parsed.success) return { available: true as const, invalid: true as const, items: [] as ServerCartItem[] };
  const items = await persistCart(userId, parsed.data);
  return items === undefined
    ? { available: false as const, invalid: false as const, items: [] as ServerCartItem[] }
    : { available: true as const, invalid: false as const, items };
}

export async function mergeSignedInCart(userId: string, value: unknown) {
  const parsed = cartInputSchema.safeParse(value);
  if (!parsed.success) return { available: true as const, invalid: true as const, items: [] as ServerCartItem[] };
  const current = await readSignedInCart(userId);
  if (!current.available) return { available: false as const, invalid: false as const, items: [] as ServerCartItem[] };
  const combined = aggregateCart([
    ...current.items.map((item) => ({ productId: item.id, qty: item.qty })),
    ...parsed.data,
  ]);
  const items = await persistCart(userId, combined);
  return items === undefined
    ? { available: false as const, invalid: false as const, items: [] as ServerCartItem[] }
    : { available: true as const, invalid: false as const, items };
}

export async function clearSignedInCart(userId: string) {
  return (await redisCommand((client) => client.del(cartKey(userId)))) !== undefined;
}
