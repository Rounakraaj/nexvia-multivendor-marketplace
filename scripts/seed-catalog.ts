import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { getMongoCollection } from "../src/lib/mongo";
import { paiseToDecimal, splitCommission, toPaise } from "../src/lib/money";
import { reindexAllProducts } from "../src/lib/search";
import { uploadSeedProductImage } from "../src/lib/s3";
import type { Document } from "mongodb";

type DummyProduct = { id: number; title: string; description: string; category: string; price: number; stock: number; thumbnail: string };
type SeedReview = Document & { productId: string; customerId: string; customerName: string; rating: number; comment: string; vendorReply: null; createdAt: Date; updatedAt: Date };
const vendorsSeed = [
  { name: "Aarav Mehta", email: "aarav@techhub.demo", shop: "TechHub" },
  { name: "Diya Sharma", email: "diya@urbanthread.demo", shop: "UrbanThread" },
  { name: "Kabir Nair", email: "kabir@homenest.demo", shop: "HomeNest" },
];

async function main() {
  const response = await fetch("https://dummyjson.com/products?limit=0", { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error("DummyJSON returned HTTP " + response.status + ".");
  const payload = await response.json() as { products: DummyProduct[] };
  if (!Array.isArray(payload.products) || payload.products.length === 0) throw new Error("DummyJSON returned no products.");
  const limit = Math.min(1000, Math.max(1, Number(process.env.SEED_PRODUCT_LIMIT) || 60));
  const products = payload.products.slice(0, limit);
  const exchangeRate = Number(process.env.DUMMYJSON_USD_TO_INR) || 83.5;
  const password = await bcrypt.hash("Vendor@12345", 10);
  const vendors = [];
  for (const input of vendorsSeed) {
    const user = await db.user.upsert({ where: { email: input.email }, update: { name: input.name, role: "VENDOR" }, create: { name: input.name, email: input.email, password, role: "VENDOR" } });
    const vendor = await db.vendor.upsert({ where: { userId: user.id }, update: { shopName: input.shop, approved: true }, create: { userId: user.id, shopName: input.shop, approved: true } });
    vendors.push(vendor);
  }
  const customerPassword = await bcrypt.hash("Customer@12345", 10);
  const customer = await db.user.upsert({ where: { email: "customer@demo.local" }, update: { name: "Demo Customer", role: "CUSTOMER", password: customerPassword }, create: { name: "Demo Customer", email: "customer@demo.local", password: customerPassword, role: "CUSTOMER" } });
  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } });

  const imported: { productId: string; vendorId: string }[] = [];
  for (const [index, source] of products.entries()) {
    const vendor = vendors[index % vendors.length];
    const sourceKey = "dummyjson:" + source.id;
    const existing = await db.product.findUnique({ where: { sourceKey }, select: { id: true, image: true } });
    let image = existing?.image ?? null;
    if (!image && source.thumbnail) {
      try { image = await uploadSeedProductImage(vendor.id, source.thumbnail); }
      catch (error) { console.warn("Image skipped for " + source.title + ":", error instanceof Error ? error.message : error); }
    }
    const category = source.category.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    const price = paiseToDecimal(toPaise((source.price * exchangeRate).toFixed(2)));
    const stock = Math.max(5, Math.min(100, Math.round(source.stock || 5)));
    const product = existing
      ? await db.product.update({ where: { id: existing.id }, data: { vendorId: vendor.id, title: source.title, description: source.description, category, price, image } })
      : await db.product.create({ data: { sourceKey, vendorId: vendor.id, title: source.title, description: source.description, category, price, stock, image } });
    imported.push({ productId: product.id, vendorId: vendor.id });
  }
  console.log("Imported " + imported.length + " DummyJSON products across " + vendors.length + " demo vendors; USD conversion " + exchangeRate + " INR.");

  const setting = await db.setting.findUniqueOrThrow({ where: { id: 1 } });
  const demoOrders: { productId: string; orderId: string }[] = [];
  for (const vendor of vendors) {
    const sample = imported.find((item) => item.vendorId === vendor.id);
    if (!sample) continue;
    const key = "seed-dummyjson-delivered-" + vendor.id;
    const previous = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } }, select: { id: true } });
    if (previous) { demoOrders.push({ productId: sample.productId, orderId: previous.id }); continue; }
    const product = await db.product.findUniqueOrThrow({ where: { id: sample.productId }, select: { price: true } });
    const linePaise = toPaise(product.price.toString());
    const split = splitCommission(linePaise, setting.commissionRate);
    const order = await db.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({ where: { id: sample.productId, stock: { gte: 1 }, vendor: { approved: true } }, data: { stock: { decrement: 1 } } });
      if (changed.count !== 1) throw new Error("Not enough stock to create a delivered seed order.");
      const result = await tx.order.create({ data: {
        customerId: customer.id, total: paiseToDecimal(linePaise), subtotal: paiseToDecimal(linePaise), status: "DELIVERED",
        shippingName: customer.name, shippingPhone: "9876543210", shippingAddress: "12 Demo Road, Bengaluru, 560001", idempotencyKey: key,
        items: { create: { productId: sample.productId, vendorId: vendor.id, price: paiseToDecimal(linePaise), qty: 1, commission: paiseToDecimal(split.commissionPaise), vendorEarning: paiseToDecimal(split.vendorEarningPaise) } },
        statusHistory: { create: [{ status: "PAID", note: "Seeded simulated payment." }, { status: "DELIVERED", note: "Delivered sample order for review demonstration." }] },
        payment: { create: { provider: "SIMULATED", status: "CAPTURED", amount: paiseToDecimal(linePaise), currency: "INR" } },
      }, select: { id: true } });
      await tx.vendor.update({ where: { id: vendor.id }, data: { balance: { increment: paiseToDecimal(split.vendorEarningPaise) } } });
      return result;
    });
    demoOrders.push({ productId: sample.productId, orderId: order.id });
  }

  const reviews = await getMongoCollection<SeedReview>("productReviews");
  if (reviews) for (const [index, sample] of demoOrders.entries()) {
    const now = new Date();
    await reviews.updateOne({ productId: sample.productId, customerId: customer.id }, { $setOnInsert: { productId: sample.productId, customerId: customer.id, customerName: customer.name, rating: index === 0 ? 5 : 4, comment: "Demo review from a delivered sample order.", vendorReply: null, createdAt: now, updatedAt: now } }, { upsert: true });
    const [aggregate] = await reviews.aggregate<{ average: number; count: number }>([{ $match: { productId: sample.productId } }, { $group: { _id: "$productId", average: { $avg: "$rating" }, count: { $sum: 1 } } }]).toArray();
    if (aggregate) await db.product.update({ where: { id: sample.productId }, data: { averageRating: Math.round(aggregate.average * 100) / 100, ratingCount: aggregate.count } });
  }
  if (!reviews) console.warn("MongoDB is unavailable; demo reviews were skipped.");
  try {
    const indexed = await reindexAllProducts();
    if (indexed !== false) console.log("Indexed " + indexed + " approved products.");
  } catch { console.warn("Elasticsearch is unavailable; run npm run reindex when it is available."); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
