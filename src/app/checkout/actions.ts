"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { paiseToDecimal, splitCommission, toPaise } from "@/lib/money";
import { syncProductSearchDocument } from "@/lib/search";
import { clientIp, rateLimit } from "@/lib/redis";
import { clearSignedInCart, readSignedInCart } from "@/lib/cart-server";
import { createGatewayOrder, markPaymentFailed, paymentMode, publicRazorpayKey, type PaymentMode } from "@/lib/payments";
import { allocateDiscountPaise } from "@/lib/coupon-math";
import { bindCouponReservation, finishCouponReservation, reserveCoupon, type ReservedCoupon } from "@/lib/marketplace-data";
import { recordActivity } from "@/lib/mongo";

const cartSchema = z.array(z.object({
  productId: z.string().min(1),
  qty: z.number(),
})).min(1).max(100);

const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient name.").max(100),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Enter a valid phone number."),
  addressLine: z.string().trim().min(5, "Enter a complete address.").max(200),
  city: z.string().trim().min(2, "Enter a city.").max(100),
  pinCode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code."),
});
const idempotencySchema = z.string().uuid();

export type CheckoutState = { error?: string; orderId?: string; payment?: { provider: "razorpay"; orderId: string; gatewayOrderId: string; amount: number; currency: "INR"; keyId: string } };

class OrderError extends Error {}

export async function placeOrder(_previous: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const session = await requireRole(["CUSTOMER"]);
  const idempotency = idempotencySchema.safeParse(formData.get("idempotencyKey"));
  if (!idempotency.success) return { error: "Refresh checkout and try again." };
  const idempotencyKey = idempotency.data;
  const existingOrder = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId: session.user.id, idempotencyKey } }, include: { payment: true } });
  if (existingOrder) {
    if (existingOrder.payment?.provider === "RAZORPAY" && existingOrder.payment.status === "PENDING" && existingOrder.payment.gatewayOrderId) {
      return { payment: { provider: "razorpay", orderId: existingOrder.id, gatewayOrderId: existingOrder.payment.gatewayOrderId, amount: toPaise(existingOrder.payment.amount.toString()), currency: "INR", keyId: publicRazorpayKey() } };
    }
    if (existingOrder.status === "PAID") return { orderId: existingOrder.id };
    return { error: "This payment attempt is already being prepared. Refresh checkout and try again." };
  }

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders.get("x-forwarded-for"));
  const [ipLimit, userLimit] = await Promise.all([
    rateLimit([`checkout:ip:${ip}`], 20, 60),
    rateLimit([`checkout:user:${session.user.id}`], 8, 60),
  ]);
  if (!ipLimit.allowed || !userLimit.allowed) return { error: "Too many checkout attempts. Wait a moment and try again." };

  let rawCart: unknown;
  const serverCart = await readSignedInCart(session.user.id);
  if (serverCart.available) {
    rawCart = serverCart.items.map(({ id, qty }) => ({ productId: id, qty }));
  } else {
    try {
      rawCart = JSON.parse(String(formData.get("items") ?? ""));
    } catch {
      return { error: "Your cart could not be read. Reload the page and try again." };
    }
  }
  const cartResult = cartSchema.safeParse(rawCart);
  if (!cartResult.success) return { error: "Your cart is empty or contains invalid quantities. Review it and try again." };
  const addressResult = addressSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    addressLine: formData.get("addressLine"),
    city: formData.get("city"),
    pinCode: formData.get("pinCode"),
  });
  if (!addressResult.success) return { error: addressResult.error.issues[0]?.message ?? "Check your shipping details." };

  const quantities = new Map<string, number>();
  for (const line of cartResult.data) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.qty);
  const lines = [...quantities].map(([productId, qty]) => ({ productId, qty }));

  let couponReservation: ReservedCoupon | null = null;
  let couponSubtotalPaise: number | null = null;
  try {
    const mode: PaymentMode = paymentMode();
    if (mode === "razorpay" && !publicRazorpayKey()) return { error: "Razorpay is selected but its test credentials are not configured." };
    const setting = await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } });
    const rate = setting.commissionRate;
    if (rate < 0 || rate > 50 || !Number.isInteger(rate * 2)) return { error: "The marketplace commission setting is invalid. Please contact support." };
    const couponCode = String(formData.get("couponCode") ?? "").trim().toUpperCase();
    if (couponCode) {
      const products = await db.product.findMany({ where: { id: { in: lines.map((line) => line.productId) }, vendor: { approved: true } }, select: { id: true, price: true, vendorId: true } });
      const byId = new Map(products.map((product) => [product.id, product]));
      let subtotalPaise = 0;
      const vendorSubtotals = new Map<string, number>();
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (!product || !Number.isSafeInteger(line.qty) || line.qty <= 0) return { error: "Your cart changed. Review its items and try again." };
        const lineTotalPaise = toPaise(product.price.toString()) * line.qty;
        if (!Number.isSafeInteger(lineTotalPaise) || lineTotalPaise > 999_999_999_999) return { error: "The cart total is outside the supported range." };
        subtotalPaise += lineTotalPaise;
        vendorSubtotals.set(product.vendorId, (vendorSubtotals.get(product.vendorId) ?? 0) + lineTotalPaise);
      }
      couponSubtotalPaise = subtotalPaise;
      couponReservation = await reserveCoupon({ code: couponCode, reservationKey: `${session.user.id}:${idempotencyKey}`, customerId: session.user.id, subtotalPaise, vendorSubtotals });
    }

    const created = await db.$transaction(async (tx) => {
      const duplicate = await tx.order.findUnique({ where: { customerId_idempotencyKey: { customerId: session.user.id, idempotencyKey } }, select: { id: true } });
      if (duplicate) return { id: duplicate.id, totalPaise: 0, created: false };
      const products = await tx.product.findMany({
        where: { id: { in: lines.map((line) => line.productId) } },
        include: { vendor: { select: { id: true, shopName: true, approved: true } } },
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (!product) throw new OrderError("A product in your cart is no longer available. Remove it and try again.");
        if (!product.vendor.approved) throw new OrderError(`${product.title} is no longer available because its shop is not approved.`);
        if (!Number.isSafeInteger(line.qty) || line.qty <= 0 || line.qty > 1_000_000) throw new OrderError(`Enter a valid quantity for ${product.title}.`);
        if (product.stock < line.qty) throw new OrderError(`${product.title} has only ${product.stock} available. Update the quantity in your cart.`);
      }

      const pricedLines = lines.map((line) => {
        const product = byId.get(line.productId)!;
        const unitPaise = toPaise(product.price.toString());
        const lineTotalPaise = unitPaise * line.qty;
        if (!Number.isSafeInteger(lineTotalPaise) || lineTotalPaise > 999_999_999_999) throw new OrderError(`${product.title} total is outside the supported range.`);
        const split = splitCommission(lineTotalPaise, rate);
        return { ...line, product, unitPaise, lineTotalPaise, ...split };
      });
      const subtotalPaise = pricedLines.reduce((total, line) => total + line.lineTotalPaise, 0);
      const eligibleLines = couponReservation ? pricedLines.filter((line) => couponReservation!.funding === "PLATFORM" || line.product.vendorId === couponReservation!.vendorId) : [];
      if (couponReservation?.funding === "VENDOR" && couponReservation.discountPaise > eligibleLines.reduce((sum, line) => sum + line.vendorEarningPaise, 0)) throw new OrderError("This vendor coupon exceeds the sponsor shop's available earnings.");
      const allocations = couponReservation ? allocateDiscountPaise(couponReservation.discountPaise, eligibleLines.map((line) => ({ id: line.productId, totalPaise: couponReservation!.funding === "VENDOR" ? line.vendorEarningPaise : line.lineTotalPaise }))) : new Map<string, number>();
      const discountedLines = pricedLines.map((line) => {
        const discountPaise = allocations.get(line.productId) ?? 0;
        const vendorDiscountPaise = couponReservation?.funding === "VENDOR" ? discountPaise : 0;
        const vendorEarningPaise = line.vendorEarningPaise - vendorDiscountPaise;
        if (vendorEarningPaise < 0) throw new OrderError("This vendor coupon is larger than the seller earnings for an eligible item.");
        return { ...line, discountPaise, vendorDiscountPaise, vendorEarningPaise };
      });
      if (couponReservation && couponReservation.funding === "VENDOR" && allocations.size !== eligibleLines.length) throw new OrderError("The vendor coupon could not be allocated to the eligible products.");
      const discountPaise = couponReservation?.discountPaise ?? 0;
      if (couponReservation && subtotalPaise !== couponSubtotalPaise) throw new OrderError("Your cart prices changed. Refresh and apply the coupon again.");
      const totalPaise = subtotalPaise - discountPaise;
      if (!Number.isSafeInteger(totalPaise) || totalPaise < 1 || totalPaise > 999_999_999_999) throw new OrderError("The order total is outside the supported range.");

      for (const line of pricedLines) {
        const updated = await tx.product.updateMany({
          where: { id: line.productId, stock: { gte: line.qty }, vendor: { approved: true } },
          data: { stock: { decrement: line.qty } },
        });
        if (updated.count === 0) {
          const latest = await tx.product.findUnique({ where: { id: line.productId }, select: { stock: true, title: true } });
          throw new OrderError(`${latest?.title ?? line.product.title} has only ${latest?.stock ?? 0} available now. Update the quantity in your cart.`);
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: session.user.id,
          total: paiseToDecimal(totalPaise),
          subtotal: paiseToDecimal(subtotalPaise),
          discountTotal: paiseToDecimal(discountPaise),
          couponCode: couponReservation?.code ?? null,
          couponFunding: couponReservation?.funding ?? null,
          couponReservationKey: couponReservation?.reservationKey ?? null,
          status: mode === "simulated" ? "PAID" : "PENDING",
          shippingName: addressResult.data.name,
          shippingPhone: addressResult.data.phone,
          shippingAddress: `${addressResult.data.addressLine}, ${addressResult.data.city}, ${addressResult.data.pinCode}`,
          idempotencyKey,
          items: {
            create: discountedLines.map((line) => ({
              productId: line.productId,
              vendorId: line.product.vendorId,
              price: paiseToDecimal(line.unitPaise),
              qty: line.qty,
              commission: paiseToDecimal(line.commissionPaise),
              vendorEarning: paiseToDecimal(line.vendorEarningPaise),
              discount: paiseToDecimal(line.discountPaise),
              vendorDiscount: paiseToDecimal(line.vendorDiscountPaise),
            })),
          },
          statusHistory: { create: { status: mode === "simulated" ? "PAID" : "PENDING", note: mode === "simulated" ? "Payment confirmed." : "Awaiting payment confirmation." } },
          payment: { create: { provider: mode === "simulated" ? "SIMULATED" : "RAZORPAY", status: mode === "simulated" ? "CAPTURED" : "PENDING", amount: paiseToDecimal(totalPaise), currency: "INR" } },
        },
        select: { id: true },
      });

      if (mode === "simulated") {
        const earningsByVendor = new Map<string, number>();
        for (const line of discountedLines) earningsByVendor.set(line.product.vendorId, (earningsByVendor.get(line.product.vendorId) ?? 0) + line.vendorEarningPaise);
        for (const [vendorId, earningPaise] of earningsByVendor) {
          await tx.vendor.update({ where: { id: vendorId }, data: { balance: { increment: paiseToDecimal(earningPaise) } } });
        }
      }
      return { id: order.id, totalPaise, created: true };
    });

    await Promise.all(lines.map((line) => syncProductSearchDocument(line.productId)));
    if (couponReservation) await bindCouponReservation(couponReservation.reservationKey, created.id);
    if (!created.created) {
      const prior = await db.order.findUnique({ where: { id: created.id }, include: { payment: true } });
      if (prior?.status === "PAID") {
        if (couponReservation) await finishCouponReservation(couponReservation.reservationKey, prior.couponReservationKey === couponReservation.reservationKey ? "USED" : "RELEASED");
        return { orderId: prior.id };
      }
      if (prior?.payment?.provider === "RAZORPAY" && prior.payment.gatewayOrderId) {
        if (couponReservation && prior.couponReservationKey !== couponReservation.reservationKey) await finishCouponReservation(couponReservation.reservationKey, "RELEASED");
        return { payment: { provider: "razorpay", orderId: prior.id, gatewayOrderId: prior.payment.gatewayOrderId, amount: toPaise(prior.payment.amount.toString()), currency: "INR", keyId: publicRazorpayKey() } };
      }
      return { error: "Payment setup is still in progress. Refresh checkout in a moment." };
    }
    if (mode === "simulated") {
      if (couponReservation) await finishCouponReservation(couponReservation.reservationKey, "USED");
      await recordActivity({ actorId: session.user.id, actorRole: "CUSTOMER", action: "order.placed", targetType: "order", targetId: created.id, details: { totalPaise: created.totalPaise, coupon: couponReservation?.code ?? null }, createdAt: new Date() });
      await clearSignedInCart(session.user.id);
      return { orderId: created.id };
    }
    try {
      const order = await db.order.findUniqueOrThrow({ where: { id: created.id }, select: { total: true } });
      const gatewayOrderId = await createGatewayOrder(created.id, toPaise(order.total.toString()));
      await db.payment.update({ where: { orderId: created.id }, data: { gatewayOrderId } });
      return { payment: { provider: "razorpay", orderId: created.id, gatewayOrderId, amount: created.totalPaise, currency: "INR", keyId: publicRazorpayKey() } };
    } catch {
      const productsToSync = await db.orderItem.findMany({ where: { orderId: created.id }, select: { productId: true } });
      await markPaymentFailed(created.id, "Could not initialize the Razorpay test payment.");
      await Promise.all(productsToSync.map(({ productId }) => syncProductSearchDocument(productId)));
      return { error: "The payment provider could not start checkout. Your reserved stock has been released; try again." };
    }
  } catch (error) {
    if (couponReservation) await finishCouponReservation(couponReservation.reservationKey, "RELEASED");
    if (error instanceof OrderError) return { error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const duplicate = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId: session.user.id, idempotencyKey } }, select: { id: true, status: true, couponReservationKey: true } });
      if (duplicate) {
        if (couponReservation) await finishCouponReservation(couponReservation.reservationKey, duplicate.couponReservationKey === couponReservation.reservationKey && duplicate.status === "PAID" ? "USED" : "RELEASED");
        if (duplicate.status === "PAID") {
          await clearSignedInCart(session.user.id);
          return { orderId: duplicate.id };
        }
      }
    }
    return { error: "We could not place your order. Please try again." };
  }
}
