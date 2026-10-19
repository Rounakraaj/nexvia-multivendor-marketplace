"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  category: z.string().min(2),
  image: z.string().url().optional(),
});

function parse(formData: FormData) {
  return schema.parse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    price: formData.get("price"),
    stock: formData.get("stock"),
    category: formData.get("category"),
    image: formData.get("image") || undefined,
  });
}

export async function createProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const d = parse(formData);
  await db.product.create({
    data: { ...d, description: d.description ?? null, image: d.image ?? null, vendorId: vendor.id },
  });
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const vendor = await requireApprovedVendor();
  const d = parse(formData);
  await db.product.updateMany({
    where: { id, vendorId: vendor.id },
    data: { ...d, description: d.description ?? null, image: d.image ?? null },
  });
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function deleteProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const id = String(formData.get("id"));
  await db.product.deleteMany({ where: { id, vendorId: vendor.id } });
  revalidatePath("/vendor/products");
}
