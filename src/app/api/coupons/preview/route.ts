import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { readSignedInCart } from "@/lib/cart-server";
import { calculateCouponDiscount, getCoupon } from "@/lib/marketplace-data";
import { toPaise } from "@/lib/money";

const requestSchema = z.object({
  code: z.string().trim().min(3).max(24),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(1000) })).min(1).max(100),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CUSTOMER") return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid coupon request." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Enter a coupon code and review your cart." }, { status: 400 });
  const serverCart = await readSignedInCart(session.user.id);
  const lines = serverCart.available ? serverCart.items.map(({ id, qty }) => ({ productId: id, qty })) : parsed.data.items;
  const products = await db.product.findMany({ where: { id: { in: lines.map((line) => line.productId) }, vendor: { approved: true } }, select: { id: true, price: true, stock: true, vendorId: true } });
  const byId = new Map(products.map((product) => [product.id, product]));
  let subtotalPaise = 0;
  const vendorSubtotals = new Map<string, number>();
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || product.stock < line.qty) return NextResponse.json({ error: "A cart item is no longer available." }, { status: 409 });
    const lineTotal = toPaise(product.price.toString()) * line.qty;
    if (!Number.isSafeInteger(lineTotal)) return NextResponse.json({ error: "The cart total is too large." }, { status: 400 });
    subtotalPaise += lineTotal;
    vendorSubtotals.set(product.vendorId, (vendorSubtotals.get(product.vendorId) ?? 0) + lineTotal);
  }
  try {
    const coupon = await getCoupon(parsed.data.code);
    if (!coupon) throw new Error("This coupon is invalid or inactive.");
    const { discountPaise } = calculateCouponDiscount(coupon, subtotalPaise, vendorSubtotals);
    return NextResponse.json({ code: coupon.code, discountPaise, subtotalPaise, payablePaise: subtotalPaise - discountPaise, funding: coupon.funding }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Coupon could not be checked." }, { status: 400 });
  }
}
