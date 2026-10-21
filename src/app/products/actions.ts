"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedVendor, requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { addProductReview, addVendorReply } from "@/lib/marketplace-data";
import { recordActivity } from "@/lib/mongo";
import { syncProductSearchDocument } from "@/lib/search";

export type ReviewActionState = { error?: string; success?: string };

export async function submitProductReview(_previous: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const session = await requireRole(["CUSTOMER"]);
  const parsed = z.object({ productId: z.string().min(1).max(40), rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().min(5).max(1200) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a rating and write a review of at least five characters." };
  const { productId, rating, comment } = parsed.data;
  const eligible = await db.order.findFirst({ where: { customerId: session.user.id, status: "DELIVERED", items: { some: { productId } } }, select: { id: true } });
  if (!eligible) return { error: "You can review a product after its order is delivered." };
  try {
    const ratingAggregate = await addProductReview({ productId, customerId: session.user.id, customerName: session.user.name ?? "Customer", rating, comment, vendorReply: null, createdAt: new Date(), updatedAt: new Date() });
    await db.product.update({ where: { id: productId }, data: { averageRating: ratingAggregate.average, ratingCount: ratingAggregate.count } });
    await syncProductSearchDocument(productId);
    await recordActivity({ actorId: session.user.id, actorRole: "CUSTOMER", action: "review.created", targetType: "product", targetId: productId, details: { rating }, createdAt: new Date() });
    revalidatePath(`/products/${productId}`);
    return { success: "Your review was added." };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return { error: "You have already reviewed this product." };
    return { error: error instanceof Error ? error.message : "Could not save your review." };
  }
}

export async function replyToProductReview(_previous: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const vendor = await requireApprovedVendor();
  const parsed = z.object({ reviewId: z.string().min(1).max(40), productId: z.string().min(1).max(40), reply: z.string().trim().min(2).max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Write a reply of at least two characters." };
  const product = await db.product.findFirst({ where: { id: parsed.data.productId, vendorId: vendor.id }, select: { id: true } });
  if (!product) return { error: "This review does not belong to your shop." };
  try {
    const updated = await addVendorReply(parsed.data.reviewId, parsed.data.productId, vendor.id, parsed.data.reply);
    if (!updated) return { error: "This review already has a reply or could not be found." };
    await recordActivity({ actorId: vendor.userId, actorRole: "VENDOR", action: "review.replied", targetType: "product", targetId: product.id, createdAt: new Date() });
    revalidatePath(`/products/${product.id}`);
    revalidatePath("/vendor/products");
    return { success: "Your reply was added." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save your reply." };
  }
}
