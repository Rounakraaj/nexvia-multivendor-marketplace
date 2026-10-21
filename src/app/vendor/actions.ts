"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";

const orderIdSchema = z.string().min(1).max(40);
export type ShipmentState = { error?: string; success?: string };

const productSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  category: z.string().trim().min(2),
  image: z.string().url().optional(),
});

function parseProduct(formData: FormData) {
  return productSchema.parse({
    title: formData.get("title"), description: formData.get("description") || undefined,
    price: formData.get("price"), stock: formData.get("stock"), category: formData.get("category"),
    image: formData.get("image") || undefined,
  });
}

export async function createProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const data = parseProduct(formData);
  await db.product.create({ data: { ...data, description: data.description ?? null, image: data.image ?? null, vendorId: vendor.id } });
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const vendor = await requireApprovedVendor();
  const data = parseProduct(formData);
  await db.product.updateMany({ where: { id, vendorId: vendor.id }, data: { ...data, description: data.description ?? null, image: data.image ?? null } });
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function deleteProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) return;
  await db.product.deleteMany({ where: { id: id.data, vendorId: vendor.id } });
  revalidatePath("/vendor/products");
}

export async function markOrderShipped(_previous: ShipmentState, formData: FormData): Promise<ShipmentState> {
  const vendor = await requireApprovedVendor();
  const parsed = orderIdSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "This order could not be identified." };
  try {
    await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: parsed.data },
        select: { status: true, items: { select: { vendorId: true } } },
      });
      if (!order || order.items.length === 0 || order.items.some((item) => item.vendorId !== vendor.id)) {
        throw new Error("Orders that contain products from other shops must be shipped by the marketplace.");
      }
      if (order.status !== "PAID") throw new Error("Only paid orders can be marked as shipped.");
      const result = await tx.order.updateMany({ where: { id: parsed.data, status: "PAID" }, data: { status: "SHIPPED" } });
      if (result.count !== 1) throw new Error("The order status changed. Refresh and try again.");
    });
    revalidatePath("/vendor/orders");
    revalidatePath("/orders");
    return { success: "Order marked as shipped." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this order." };
  }
}
