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

  try {
    const mode: PaymentMode = paymentMode();
    if (mode === "razorpay" && !publicRazorpayKey()) return { error: "Razorpay is selected but its test credentials are not configured." };
    const setting = await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } });
    const rate = setting.commissionRate;
    if (rate < 0 || rate > 50 || !Number.isInteger(rate * 2)) return { error: "The marketplace commission setting is invalid. Please contact support." };

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
      const totalPaise = pricedLines.reduce((total, line) => total + line.lineTotalPaise, 0);
      if (!Number.isSafeInteger(totalPaise) || totalPaise > 999_999_999_999) throw new OrderError("The order total is outside the supported range.");

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
          status: mode === "simulated" ? "PAID" : "PENDING",
          shippingName: addressResult.data.name,
          shippingPhone: addressResult.data.phone,
          shippingAddress: `${addressResult.data.addressLine}, ${addressResult.data.city}, ${addressResult.data.pinCode}`,
          idempotencyKey,
          items: {
            create: pricedLines.map((line) => ({
              productId: line.productId,
              vendorId: line.product.vendorId,
              price: paiseToDecimal(line.unitPaise),
              qty: line.qty,
              commission: paiseToDecimal(line.commissionPaise),
              vendorEarning: paiseToDecimal(line.vendorEarningPaise),
            })),
          },
          statusHistory: { create: { status: mode === "simulated" ? "PAID" : "PENDING", note: mode === "simulated" ? "Payment confirmed." : "Awaiting payment confirmation." } },
          payment: { create: { provider: mode === "simulated" ? "SIMULATED" : "RAZORPAY", status: mode === "simulated" ? "CAPTURED" : "PENDING", amount: paiseToDecimal(totalPaise), currency: "INR" } },
        },
        select: { id: true },
      });

      if (mode === "simulated") {
        const earningsByVendor = new Map<string, number>();
        for (const line of pricedLines) earningsByVendor.set(line.product.vendorId, (earningsByVendor.get(line.product.vendorId) ?? 0) + line.vendorEarningPaise);
        for (const [vendorId, earningPaise] of earningsByVendor) {
          await tx.vendor.update({ where: { id: vendorId }, data: { balance: { increment: paiseToDecimal(earningPaise) } } });
        }
      }
      return { id: order.id, totalPaise, created: true };
    });

    await Promise.all(lines.map((line) => syncProductSearchDocument(line.productId)));
    if (!created.created) {
      const prior = await db.order.findUnique({ where: { id: created.id }, include: { payment: true } });
      if (prior?.status === "PAID") return { orderId: prior.id };
      if (prior?.payment?.provider === "RAZORPAY" && prior.payment.gatewayOrderId) {
        return { payment: { provider: "razorpay", orderId: prior.id, gatewayOrderId: prior.payment.gatewayOrderId, amount: toPaise(prior.payment.amount.toString()), currency: "INR", keyId: publicRazorpayKey() } };
      }
      return { error: "Payment setup is still in progress. Refresh checkout in a moment." };
    }
    if (mode === "simulated") {
      await clearSignedInCart(session.user.id);
      return { orderId: created.id };
    }
    try {
      const gatewayOrderId = await createGatewayOrder(created.id, created.totalPaise);
      await db.payment.update({ where: { orderId: created.id }, data: { gatewayOrderId } });
      return { payment: { provider: "razorpay", orderId: created.id, gatewayOrderId, amount: created.totalPaise, currency: "INR", keyId: publicRazorpayKey() } };
    } catch {
      const productsToSync = await db.orderItem.findMany({ where: { orderId: created.id }, select: { productId: true } });
      await markPaymentFailed(created.id, "Could not initialize the Razorpay test payment.");
      await Promise.all(productsToSync.map(({ productId }) => syncProductSearchDocument(productId)));
      return { error: "The payment provider could not start checkout. Your reserved stock has been released; try again." };
    }
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const duplicate = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId: session.user.id, idempotencyKey } }, select: { id: true } });
      if (duplicate) {
        await clearSignedInCart(session.user.id);
        return { orderId: duplicate.id };
      }
    }
    return { error: "We could not place your order. Please try again." };
  }
}
