"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { paiseToDecimal, toPaise } from "@/lib/money";
import { syncProductSearchDocument, syncVendorSearchDocuments } from "@/lib/search";

const approvalSchema = z.object({ vendorId: z.string().min(1).max(40), approved: z.enum(["true", "false"]) });
const commissionSchema = z.object({ rate: z.coerce.number().min(0).max(50).refine((value) => Number.isInteger(value * 2), "Use increments of 0.5.") });
const orderStatusSchema = z.object({ orderId: z.string().min(1).max(40), status: z.enum(["SHIPPED", "DELIVERED", "CANCELLED"]) });

export type AdminActionState = { error?: string; success?: string };

export async function setVendorApproval(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole(["ADMIN"]);
  const parsed = approvalSchema.safeParse({ vendorId: formData.get("vendorId"), approved: formData.get("approved") });
  if (!parsed.success) return { error: "Choose a valid vendor and approval status." };
  try {
    const updated = await db.vendor.updateMany({ where: { id: parsed.data.vendorId }, data: { approved: parsed.data.approved === "true" } });
    if (updated.count !== 1) return { error: "This vendor could not be found. Refresh and try again." };
    await syncVendorSearchDocuments(parsed.data.vendorId, parsed.data.approved === "true");
    revalidatePath("/admin");
    return { success: parsed.data.approved === "true" ? "Vendor approved." : "Vendor suspended." };
  } catch {
    return { error: "Could not update this vendor. Please try again." };
  }
}

export async function saveCommission(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole(["ADMIN"]);
  const parsed = commissionSchema.safeParse({ rate: formData.get("rate") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a rate from 0 to 50 in steps of 0.5." };
  await db.setting.upsert({ where: { id: 1 }, update: { commissionRate: parsed.data.rate }, create: { id: 1, commissionRate: parsed.data.rate } });
  revalidatePath("/admin/commission");
  return { success: "Commission rate saved. It applies to future orders only." };
}

export async function updateOrderStatus(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireRole(["ADMIN"]);
  const parsed = orderStatusSchema.safeParse({ orderId: formData.get("orderId"), status: formData.get("status") });
  if (!parsed.success) return { error: "Choose a valid order status." };
  try {
    if (parsed.data.status !== "CANCELLED") {
      const allowed = parsed.data.status === "SHIPPED" ? ["PAID", "SHIPPED"] as const : ["SHIPPED", "DELIVERED"] as const;
      const result = await db.order.updateMany({ where: { id: parsed.data.orderId, status: { in: [...allowed] } }, data: { status: parsed.data.status } });
      if (result.count !== 1) return { error: `This order cannot be marked ${parsed.data.status.toLowerCase()} from its current status.` };
    } else {
      let changedProductIds: string[] = [];
      await db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: parsed.data.orderId }, include: { items: true } });
        if (!order) throw new Error("Order not found.");
        if (order.status === "CANCELLED" || order.status === "DELIVERED") throw new Error("Cancelled or delivered orders cannot be cancelled again.");
        const updated = await tx.order.updateMany({ where: { id: order.id, status: { in: ["PENDING", "PAID", "SHIPPED"] } }, data: { status: "CANCELLED" } });
        if (updated.count !== 1) throw new Error("The order status changed. Refresh and try again.");

        const stockByProduct = new Map<string, number>();
        const balanceByVendor = new Map<string, number>();
        for (const item of order.items) {
          stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + item.qty);
          balanceByVendor.set(item.vendorId, (balanceByVendor.get(item.vendorId) ?? 0) + toPaise(item.vendorEarning.toString()));
        }
        changedProductIds = [...stockByProduct.keys()];
        for (const [productId, qty] of stockByProduct) await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
        for (const [vendorId, earning] of balanceByVendor) await tx.vendor.update({ where: { id: vendorId }, data: { balance: { decrement: paiseToDecimal(earning) } } });
      });
      await Promise.all(changedProductIds.map((productId) => syncProductSearchDocument(productId)));
    }
    revalidatePath("/admin/orders");
    revalidatePath("/admin/commission");
    revalidatePath("/vendor/orders");
    revalidatePath("/vendor/earnings");
    revalidatePath("/orders");
    return { success: "Order status updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update this order." };
  }
}
