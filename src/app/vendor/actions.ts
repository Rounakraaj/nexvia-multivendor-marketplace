"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireApprovedVendor } from "@/lib/guard";
import { db } from "@/lib/db";
import { assertProductImageObject, deleteProductImage, isProductImageKeyForVendor } from "@/lib/s3";
import { syncProductSearchDocument } from "@/lib/search";

const orderIdSchema = z.string().min(1).max(40);
export type ShipmentState = { error?: string; success?: string };

const productSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  category: z.string().trim().min(2),
  image: z.string().max(512).optional(),
});

function parseProduct(formData: FormData) {
  return productSchema.parse({
    title: formData.get("title"), description: formData.get("description") || undefined,
    price: formData.get("price"), stock: formData.get("stock"), category: formData.get("category"),
    image: formData.get("image") || undefined,
  });
}

async function removeImageBestEffort(image: string | null) {
  if (!image?.startsWith("products/")) return;
  try {
    await deleteProductImage(image);
  } catch (error) {
    console.error("Could not delete replaced product image from S3.", error);
  }
}

export async function createProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const data = parseProduct(formData);
  if (data.image) {
    if (!isProductImageKeyForVendor(data.image, vendor.id)) throw new Error("Choose an image uploaded to your shop.");
    await assertProductImageObject(data.image, vendor.id);
  }
  const product = await db.product.create({ data: { ...data, description: data.description ?? null, image: data.image ?? null, vendorId: vendor.id }, select: { id: true } });
  await syncProductSearchDocument(product.id, true);
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const vendor = await requireApprovedVendor();
  const data = parseProduct(formData);
  const current = await db.product.findFirst({ where: { id, vendorId: vendor.id }, select: { image: true, category: true } });
  if (!current) throw new Error("This product does not belong to your shop.");
  if (data.image && data.image !== current.image) {
    if (!isProductImageKeyForVendor(data.image, vendor.id)) throw new Error("Choose an image uploaded to your shop.");
    await assertProductImageObject(data.image, vendor.id);
  }
  await db.product.update({ where: { id }, data: { ...data, description: data.description ?? null, image: data.image ?? null } });
  await syncProductSearchDocument(id, current.category !== data.category);
  if (current.image !== data.image) await removeImageBestEffort(current.image);
  revalidatePath("/vendor/products");
  redirect("/vendor/products");
}

export async function deleteProduct(formData: FormData) {
  const vendor = await requireApprovedVendor();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) return;
  const product = await db.product.findFirst({ where: { id: id.data, vendorId: vendor.id }, select: { id: true, image: true } });
  if (!product) return;
  await db.product.delete({ where: { id: product.id } });
  await syncProductSearchDocument(product.id, true);
  await removeImageBestEffort(product.image);
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
