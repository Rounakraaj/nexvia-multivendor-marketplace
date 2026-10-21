"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { paiseToDecimal, toPaise } from "@/lib/money";
import { syncProductSearchDocument, syncVendorSearchDocuments } from "@/lib/search";
import { canTransitionOrder, type OrderStatus } from "@/lib/order-lifecycle";
import { refundGatewayPayment } from "@/lib/payments";
import { createCouponRecord, finishCouponReservation, restoreUsedCouponReservation, setCouponActive } from "@/lib/marketplace-data";
import { recordActivity } from "@/lib/mongo";

const approvalSchema = z.object({ vendorId: z.string().min(1).max(40), approved: z.enum(["true", "false"]) });
const commissionSchema = z.object({ rate: z.coerce.number().min(0).max(50).refine((value) => Number.isInteger(value * 2), "Use increments of 0.5.") });
const orderStatusSchema = z.object({ orderId: z.string().min(1).max(40), status: z.enum(["PACKED", "SHIPPED", "DELIVERED", "CANCELLED"]) });
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/),
  funding: z.enum(["PLATFORM", "VENDOR"]),
  vendorId: z.string().max(40).optional(),
  discountType: z.enum(["FIXED", "PERCENT"]),
  value: z.coerce.number().positive(),
  maxDiscount: z.union([z.literal(""), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  minimumOrder: z.coerce.number().min(0),
  usageLimit: z.coerce.number().int().min(1).max(1_000_000),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export type AdminActionState = { error?: string; success?: string };

export async function setVendorApproval(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = approvalSchema.safeParse({ vendorId: formData.get("vendorId"), approved: formData.get("approved") });
  if (!parsed.success) return { error: "Choose a valid vendor and approval status." };
  try {
    const updated = await db.vendor.updateMany({ where: { id: parsed.data.vendorId }, data: { approved: parsed.data.approved === "true" } });
    if (updated.count !== 1) return { error: "This vendor could not be found. Refresh and try again." };
    await syncVendorSearchDocuments(parsed.data.vendorId, parsed.data.approved === "true");
    await recordActivity({ actorId: session.user.id, actorRole: "ADMIN", action: parsed.data.approved === "true" ? "vendor.approved" : "vendor.suspended", targetType: "vendor", targetId: parsed.data.vendorId, createdAt: new Date() });
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

export async function createCoupon(_previous: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = couponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the coupon fields." };
  const data = parsed.data;
  if (data.discountType === "PERCENT" && data.value > 100) return { error: "Percentage discounts cannot exceed 100%." };
  if (data.funding === "VENDOR" && !data.vendorId) return { error: "Choose the shop funding this coupon." };
  if (data.funding === "PLATFORM" && data.vendorId) return { error: "Platform-funded coupons cannot be tied to a shop." };
  const vendorId = data.vendorId || null;
  if (vendorId && !await db.vendor.findFirst({ where: { id: vendorId, approved: true }, select: { id: true } })) return { error: "Choose an approved vendor." };
  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) || (startsAt && endsAt && startsAt >= endsAt)) return { error: "Choose a valid coupon date range." };
  try {
    await createCouponRecord({
      code: data.code, funding: data.funding, vendorId, discountType: data.discountType,
      value: data.discountType === "FIXED" ? toPaise(data.value) : data.value,
      maxDiscountPaise: data.maxDiscount ? toPaise(Number(data.maxDiscount)) : null,
      minimumOrderPaise: toPaise(data.minimumOrder), usageLimit: data.usageLimit, startsAt, endsAt, active: true, createdBy: session.user.id,
    });
    await recordActivity({ actorId: session.user.id, actorRole: "ADMIN", action: "coupon.created", targetType: "coupon", targetId: data.code, details: { funding: data.funding, type: data.discountType }, createdAt: new Date() });
    revalidatePath("/admin/coupons");
    return { success: `Coupon ${data.code} created.` };
  } catch (error) {
    return { error: error instanceof Error && error.message.includes("E11000") ? "That coupon code already exists." : error instanceof Error ? error.message : "Could not create the coupon." };
  }
}

export async function changeCouponActive(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const updated = await setCouponActive(id, active);
  if (updated) {
    await recordActivity({ actorId: session.user.id, actorRole: "ADMIN", action: active ? "coupon.activated" : "coupon.deactivated", targetType: "coupon", targetId: id, createdAt: new Date() });
    revalidatePath("/admin/coupons");
  }
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
    if (parsed.data.status === "CANCELLED") {
      const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { couponReservationKey: true } });
      await finishCouponReservation(order?.couponReservationKey, "RELEASED");
      await restoreUsedCouponReservation(parsed.data.orderId);
    }
    await recordActivity({ actorId: session.user.id, actorRole: "ADMIN", action: `order.${parsed.data.status.toLowerCase()}`, targetType: "order", targetId: parsed.data.orderId, createdAt: new Date() });
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
