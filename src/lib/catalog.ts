import { z } from "zod";
import { db } from "@/lib/db";
import { redisCommand } from "@/lib/redis";

const categoryListSchema = z.array(z.string());

export async function getProductCategories() {
  const cached = await redisCommand((client) => client.get("cache:categories"));
  if (cached) {
    try {
      const parsed = categoryListSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return parsed.data;
    } catch {
      // Ignore expired or malformed cache values and rebuild from PostgreSQL.
    }
  }
  const rows = await db.product.findMany({ where: { vendor: { approved: true } }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } });
  const categories = rows.map((row) => row.category);
  await redisCommand((client) => client.set("cache:categories", JSON.stringify(categories), { EX: 300 }));
  return categories;
}
