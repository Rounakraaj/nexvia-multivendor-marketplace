import { db } from "@/lib/db";
import { paiseToDecimal, toPaise } from "@/lib/money";
import { syncProductSearchDocument } from "@/lib/search";
import { clearSignedInCart } from "@/lib/cart-server";
import { verifyHmacSha256 } from "@/lib/payment-signatures";
import { finishCouponReservation } from "@/lib/marketplace-data";
import { recordActivity } from "@/lib/mongo";

export type PaymentMode = "simulated" | "razorpay";

export function paymentMode(): PaymentMode {
  const mode = (process.env.PAYMENT_PROVIDER ?? "simulated").toLowerCase();
  if (mode !== "simulated" && mode !== "razorpay") throw new Error("PAYMENT_PROVIDER must be simulated or razorpay.");
  return mode;
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function razorpayAuth() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error("Razorpay test credentials are not configured.");
  return { key, secret, authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` };
}

async function razorpayRequest(path: string, init: RequestInit = {}) {
  const auth = razorpayAuth();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: auth.authorization, "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Razorpay could not complete this payment request.");
  return body as Record<string, unknown>;
}

export async function createGatewayOrder(orderId: string, amountPaise: number) {
  const result = await razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: orderId, partial_payment: false, notes: { nexvia_order_id: orderId } }),
  });
  if (typeof result.id !== "string") throw new Error("Razorpay returned an invalid order.");
  return result.id;
}

export async function refundGatewayPayment(paymentId: string, orderId: string, amountPaise: number) {
  const result = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, notes: { nexvia_order_id: orderId, reason: "admin_order_cancellation" } }),
  });
  if (typeof result.id !== "string") throw new Error("Razorpay did not confirm the refund.");
  return result.id;
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(secret && verifyHmacSha256(`${orderId}|${paymentId}`, signature, secret));
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return Boolean(secret && verifyHmacSha256(rawBody, signature, secret));
}

export async function isGatewayPaymentCaptured(paymentId: string, expectedOrderId: string) {
  const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
  return payment.order_id === expectedOrderId && payment.status === "captured";
}

export async function markPaymentCaptured(orderId: string, gatewayPaymentId: string) {
  const result = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId }, include: { order: { include: { items: true } } } });
    if (!payment) return { ok: false as const, customerId: null };
    if (payment.status === "CAPTURED") return { ok: payment.gatewayPaymentId === gatewayPaymentId, customerId: payment.order.customerId, couponReservationKey: payment.order.couponReservationKey };
    if (payment.status !== "PENDING" || payment.order.status !== "PENDING" || !payment.gatewayOrderId) return { ok: false as const, customerId: null };
    const changed = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "PAID" } });
    if (changed.count !== 1) return { ok: false as const, customerId: null };
    await tx.payment.update({ where: { id: payment.id }, data: { status: "CAPTURED", gatewayPaymentId, failureReason: null } });
    await tx.orderStatusHistory.create({ data: { orderId, status: "PAID", note: "Payment captured." } });
    const earningsByVendor = new Map<string, number>();
    for (const item of payment.order.items) earningsByVendor.set(item.vendorId, (earningsByVendor.get(item.vendorId) ?? 0) + toPaise(item.vendorEarning.toString()));
    for (const [vendorId, earningPaise] of earningsByVendor) await tx.vendor.update({ where: { id: vendorId }, data: { balance: { increment: paiseToDecimal(earningPaise) } } });
    return { ok: true as const, customerId: payment.order.customerId, couponReservationKey: payment.order.couponReservationKey };
  });
  if (result.ok && result.customerId) {
    await clearSignedInCart(result.customerId);
    await finishCouponReservation(result.couponReservationKey, "USED");
    await recordActivity({ actorId: result.customerId, actorRole: "CUSTOMER", action: "payment.captured", targetType: "order", targetId: orderId, createdAt: new Date() });
  }
  return result;
}

export async function markPaymentFailed(orderId: string, reason: string) {
  const changedProductIds = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId }, include: { order: { include: { items: true } } } });
    if (!payment || payment.status !== "PENDING" || payment.order.status !== "PENDING") return { productIds: [] as string[], couponReservationKey: null as string | null };
    const changed = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "CANCELLED", idempotencyKey: null } });
    if (changed.count !== 1) return { productIds: [] as string[], couponReservationKey: null as string | null };
    await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason.slice(0, 500) } });
    await tx.orderStatusHistory.create({ data: { orderId, status: "CANCELLED", note: "Payment failed or expired; reserved stock was released." } });
    const stock = new Map<string, number>();
    for (const item of payment.order.items) stock.set(item.productId, (stock.get(item.productId) ?? 0) + item.qty);
    for (const [productId, qty] of stock) await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
    return { productIds: [...stock.keys()], couponReservationKey: payment.order.couponReservationKey };
  });
  await Promise.all(changedProductIds.productIds.map((productId) => syncProductSearchDocument(productId)));
  await finishCouponReservation(changedProductIds.couponReservationKey, "RELEASED");
  if (changedProductIds.productIds.length > 0) await recordActivity({ actorId: null, actorRole: null, action: "payment.failed_or_expired", targetType: "order", targetId: orderId, createdAt: new Date() });
  return changedProductIds.productIds.length > 0;
}

export async function expirePendingPayments() {
  const minutes = Math.min(1440, Math.max(5, Number(process.env.PAYMENT_PENDING_TTL_MINUTES) || 30));
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const pending = await db.payment.findMany({ where: { provider: "RAZORPAY", status: "PENDING", createdAt: { lt: cutoff } }, select: { orderId: true } });
  let expired = 0;
  for (const payment of pending) if (await markPaymentFailed(payment.orderId, "Payment attempt expired.")) expired += 1;
  return expired;
}

export function publicRazorpayKey() {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export function paymentAmountToPaise(amount: string) {
  return toPaise(amount);
}
