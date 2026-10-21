"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { paiseToDecimal, toPaise } from "@/lib/money";
import { syncProductSearchDocument, syncVendorSearchDocuments } from "@/lib/search";
import { canTransitionOrder, type OrderStatus } from "@/lib/order-lifecycle";
import { refundGatewayPayment } from "@/lib/payments";

const approvalSchema = z.object({ vendorId: z.string().min(1).max(40), approved: z.enum(["true", "false"]) });
const commissionSchema = z.object({ rate: z.coerce.number().min(0).max(50).refine((value) => Number.isInteger(value * 2), "Use increments of 0.5.") });
const orderStatusSchema = z.object({ orderId: z.string().min(1).max(40), status: z.enum(["PACKED", "SHIPPED", "DELIVERED", "CANCELLED"]) });

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
  const session = await requireRole(["ADMIN"]);
  const parsed = orderStatusSchema.safeParse({ orderId: formData.get("orderId"), status: formData.get("status") });
  if (!parsed.success) return { error: "Choose a valid order status." };
  try {
    let gatewayRefundId: string | null = null;
    if (parsed.data.status === "CANCELLED") {
      const current = await db.order.findUnique({ where: { id: parsed.data.orderId }, include: { payment: true } });
      if (!current) return { error: "Order not found." };
      if (!canTransitionOrder(current.status, "CANCELLED")) return { error: "This order can no longer be cancelled." };
      if (current.payment?.provider === "RAZORPAY" && current.payment.status === "REFUNDED" && current.payment.gatewayRefundId) {
        gatewayRefundId = current.payment.gatewayRefundId;
      } else if (current.payment?.provider === "RAZORPAY" && current.payment.status === "REFUND_PENDING" && current.payment.gatewayRefundId) {
        gatewayRefundId = current.payment.gatewayRefundId;
      } else if (current.payment?.provider === "RAZORPAY" && current.payment.status === "REFUND_PENDING") {
        return { error: "The payment provider is still processing this refund. Retry in a moment." };
      } else if (current.payment?.provider === "RAZORPAY" && current.payment.status === "CAPTURED") {
        if (!current.payment.gatewayPaymentId) return { error: "The captured payment has no gateway reference, so it cannot be refunded." };
        const claim = await db.payment.updateMany({ where: { id: current.payment.id, status: "CAPTURED" }, data: { status: "REFUND_PENDING" } });
        if (claim.count === 1) {
          try {
            gatewayRefundId = await refundGatewayPayment(current.payment.gatewayPaymentId, current.id, toPaise(current.payment.amount.toString()));
            await db.payment.update({ where: { id: current.payment.id }, data: { gatewayRefundId } });
          } catch (error) {
            await db.payment.updateMany({ where: { id: current.payment.id, status: "REFUND_PENDING", gatewayRefundId: null }, data: { status: "CAPTURED" } });
            throw error;
          }
        } else {
          const pendingRefund = await db.payment.findUnique({ where: { id: current.payment.id }, select: { status: true, gatewayRefundId: true } });
          if (pendingRefund?.status !== "REFUND_PENDING" || !pendingRefund.gatewayRefundId) return { error: "A refund for this payment is already being processed." };
          gatewayRefundId = pendingRefund.gatewayRefundId;
        }
      }
    }
    let changedProductIds: string[] = [];
    await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: parsed.data.orderId }, include: { items: true, payment: true } });
      if (!order) throw new Error("Order not found.");
      const nextStatus = parsed.data.status as OrderStatus;
      if (!canTransitionOrder(order.status, nextStatus)) throw new Error(`This order cannot be marked ${nextStatus.toLowerCase()} from its current status.`);
      const updated = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: nextStatus } });
      if (updated.count !== 1) throw new Error("The order status changed. Refresh and try again.");
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: nextStatus, changedById: session.user.id } });

      if (nextStatus === "CANCELLED") {
        if (order.payment) {
          const paymentStatus = gatewayRefundId ? "REFUNDED" : "CANCELLED";
          await tx.payment.update({ where: { id: order.payment.id }, data: { status: paymentStatus, gatewayRefundId } });
        }
        const stockByProduct = new Map<string, number>();
        const balanceByVendor = new Map<string, number>();
        for (const item of order.items) {
          stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + item.qty);
          balanceByVendor.set(item.vendorId, (balanceByVendor.get(item.vendorId) ?? 0) + toPaise(item.vendorEarning.toString()));
        }
        changedProductIds = [...stockByProduct.keys()];
        for (const [productId, qty] of stockByProduct) await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
        if (order.status !== "PENDING") {
          for (const [vendorId, earning] of balanceByVendor) await tx.vendor.update({ where: { id: vendorId }, data: { balance: { decrement: paiseToDecimal(earning) } } });
        }
      }
    });
    await Promise.all(changedProductIds.map((productId) => syncProductSearchDocument(productId)));
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
