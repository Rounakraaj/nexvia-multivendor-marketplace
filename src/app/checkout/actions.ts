"use server";

import { z } from "zod";
import { requireRole } from "@/lib/guard";
import { db } from "@/lib/db";
import { paiseToDecimal, splitCommission, toPaise } from "@/lib/money";
import { syncProductSearchDocument } from "@/lib/search";

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

export type CheckoutState = { error?: string; orderId?: string };

class OrderError extends Error {}

export async function placeOrder(_previous: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const session = await requireRole(["CUSTOMER"]);
  let rawCart: unknown;
  try {
    rawCart = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    return { error: "Your cart could not be read. Reload the page and try again." };
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
    const setting = await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, commissionRate: 10 } });
    const rate = setting.commissionRate;
    if (rate < 0 || rate > 50 || !Number.isInteger(rate * 2)) return { error: "The marketplace commission setting is invalid. Please contact support." };

    // Integrate Razorpay or Stripe test-mode authorization here before creating the PAID order.
    const orderId = await db.$transaction(async (tx) => {
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
          status: "PAID",
          shippingName: addressResult.data.name,
          shippingPhone: addressResult.data.phone,
          shippingAddress: `${addressResult.data.addressLine}, ${addressResult.data.city}, ${addressResult.data.pinCode}`,
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
        },
        select: { id: true },
      });

      const earningsByVendor = new Map<string, number>();
      for (const line of pricedLines) earningsByVendor.set(line.product.vendorId, (earningsByVendor.get(line.product.vendorId) ?? 0) + line.vendorEarningPaise);
      for (const [vendorId, earningPaise] of earningsByVendor) {
        await tx.vendor.update({ where: { id: vendorId }, data: { balance: { increment: paiseToDecimal(earningPaise) } } });
      }
      return order.id;
    });

    await Promise.all(lines.map((line) => syncProductSearchDocument(line.productId)));

    return { orderId };
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    return { error: "We could not place your order. Please try again." };
  }
}
