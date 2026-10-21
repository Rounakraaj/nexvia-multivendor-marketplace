import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { paiseToDecimal, splitCommission, toPaise } from "../src/lib/money";

type P = [title: string, category: string, price: number, stock: number, description: string];

const img = (seed: string) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/450`;

const vendors: { name: string; email: string; shop: string; products: P[] }[] = [
  {
    name: "Aarav Mehta",
    email: "aarav@techhub.demo",
    shop: "TechHub",
    products: [
      ["Wireless Earbuds Pro", "Electronics", 2499, 40, "Noise-cancelling earbuds with a 28-hour battery case."],
      ["Smart Fitness Band", "Electronics", 1799, 60, "Heart-rate, sleep and step tracking with a 10-day battery."],
      ["Portable Bluetooth Speaker", "Electronics", 2199, 35, "Waterproof speaker with deep bass and 12 hours of playtime."],
      ["20000 mAh Power Bank", "Electronics", 1499, 80, "Fast-charging power bank with dual USB ports."],
      ["Mechanical Keyboard", "Electronics", 3499, 25, "Hot-swappable switches with soft white backlighting."],
      ["USB-C Fast Charger 65W", "Electronics", 1299, 100, "Compact GaN charger for phones, tablets and laptops."],
    ],
  },
  {
    name: "Diya Sharma",
    email: "diya@urbanthread.demo",
    shop: "UrbanThread",
    products: [
      ["Classic Denim Jacket", "Fashion", 2999, 30, "Mid-weight denim with a relaxed everyday fit."],
      ["Everyday Cotton T-Shirt", "Fashion", 599, 150, "Soft combed cotton, pre-shrunk, available in many colours."],
      ["Leather Crossbody Bag", "Fashion", 2499, 20, "Hand-stitched faux leather with an adjustable strap."],
      ["Canvas Sneakers", "Fashion", 1999, 45, "Lightweight sneakers with a cushioned insole."],
      ["Minimal Analog Watch", "Fashion", 3299, 18, "Slim stainless-steel case with a sapphire-coated glass."],
      ["Wool Blend Scarf", "Fashion", 899, 70, "Warm, soft and lightweight for cool evenings."],
    ],
  },
  {
    name: "Kabir Nair",
    email: "kabir@homenest.demo",
    shop: "HomeNest",
    products: [
      ["Ceramic Dinner Set (16 pcs)", "Home & Kitchen", 3499, 15, "Matte-finish dinner set for four, microwave and dishwasher safe."],
      ["Cast Iron Skillet", "Home & Kitchen", 1899, 28, "Pre-seasoned 10-inch skillet that lasts for decades."],
      ["Scented Soy Candle Set", "Home & Kitchen", 799, 90, "Three hand-poured candles in calming fragrances."],
      ["Cotton Bedsheet Set", "Home & Kitchen", 1599, 40, "Queen-size sheet with two pillow covers, 220 thread count."],
      ["Glass Water Bottle", "Home & Kitchen", 499, 120, "Borosilicate glass with a silicone sleeve and bamboo lid."],
      ["Bamboo Cutting Board", "Home & Kitchen", 699, 55, "Large reversible board with a juice groove."],
    ],
  },
];

async function main() {
  const password = await bcrypt.hash("Vendor@12345", 10);

  for (const v of vendors) {
    const user = await db.user.upsert({
      where: { email: v.email },
      update: { name: v.name, role: "VENDOR" },
      create: { name: v.name, email: v.email, password, role: "VENDOR" },
    });
    const vendor = await db.vendor.upsert({
      where: { userId: user.id },
      update: { shopName: v.shop, approved: true },
      create: { userId: user.id, shopName: v.shop, approved: true },
    });

    const existing = await db.product.count({ where: { vendorId: vendor.id } });
    if (existing === 0) {
      await db.product.createMany({
        data: v.products.map(([title, category, price, stock, description]) => ({
          vendorId: vendor.id,
          title,
          category,
          price,
          stock,
          description,
          image: img(title),
        })),
      });
    }
    console.log("Seeded:", v.shop);
  }

  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } });
  const customerPassword = await bcrypt.hash("Customer@12345", 10);
  const customer = await db.user.upsert({
    where: { email: "customer@demo.local" },
    update: { name: "Demo Customer", role: "CUSTOMER", password: customerPassword },
    create: { name: "Demo Customer", email: "customer@demo.local", password: customerPassword, role: "CUSTOMER" },
  });
  const setting = await db.setting.findUniqueOrThrow({ where: { id: 1 } });
  for (const v of vendors) {
    const vendor = await db.vendor.findUniqueOrThrow({ where: { userId: (await db.user.findUniqueOrThrow({ where: { email: v.email } })).id } });
    const product = await db.product.findFirst({ where: { vendorId: vendor.id }, orderBy: { createdAt: "asc" } });
    if (!product) continue;
    const existing = await db.order.findFirst({ where: { customerId: customer.id, status: "PAID", items: { some: { productId: product.id } } } });
    if (existing) continue;
    const linePaise = toPaise(product.price.toString());
    const split = splitCommission(linePaise, setting.commissionRate);
    await db.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({ where: { id: product.id, stock: { gte: 1 }, vendor: { approved: true } }, data: { stock: { decrement: 1 } } });
      if (changed.count !== 1) throw new Error(`Not enough stock to seed ${product.title}.`);
      await tx.order.create({
        data: {
          customerId: customer.id,
          total: paiseToDecimal(linePaise),
          status: "PAID",
          shippingName: customer.name,
          shippingPhone: "9876543210",
          shippingAddress: "12 Demo Road, Bengaluru, 560001",
          items: { create: { productId: product.id, vendorId: vendor.id, price: paiseToDecimal(linePaise), qty: 1, commission: paiseToDecimal(split.commissionPaise), vendorEarning: paiseToDecimal(split.vendorEarningPaise) } },
        },
      });
      await tx.vendor.update({ where: { id: vendor.id }, data: { balance: { increment: paiseToDecimal(split.vendorEarningPaise) } } });
    });
    console.log("Seeded demo order:", v.shop);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
