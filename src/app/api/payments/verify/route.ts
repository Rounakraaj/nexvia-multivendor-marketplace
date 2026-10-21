import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearSignedInCart } from "@/lib/cart-server";
import { isGatewayPaymentCaptured, markPaymentCaptured, verifyCheckoutSignature } from "@/lib/payments";

const schema = z.object({
  razorpay_order_id: z.string().min(5).max(100),
  razorpay_payment_id: z.string().min(5).max(100),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CUSTOMER") return NextResponse.json({ error: "Customer sign-in required." }, { status: 401 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid payment response." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment response." }, { status: 400 });
  const result = parsed.data;
  const payment = await db.payment.findFirst({ where: { order: { customerId: session.user.id }, provider: "RAZORPAY", gatewayOrderId: result.razorpay_order_id }, include: { order: { select: { id: true, status: true } } } });
  if (!payment) return NextResponse.json({ error: "This payment does not match your order." }, { status: 404 });
  if (payment.status === "CAPTURED" && payment.gatewayPaymentId === result.razorpay_payment_id) return NextResponse.json({ orderId: payment.order.id });
  if (payment.status !== "PENDING" || payment.order.status !== "PENDING") return NextResponse.json({ error: "This payment attempt is no longer active." }, { status: 409 });
  if (!verifyCheckoutSignature(payment.gatewayOrderId!, result.razorpay_payment_id, result.razorpay_signature)) return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  try {
    if (!await isGatewayPaymentCaptured(result.razorpay_payment_id, payment.gatewayOrderId!)) return NextResponse.json({ error: "Razorpay has not confirmed a captured payment yet. Refresh your orders shortly." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Razorpay status could not be checked. Your payment will be reconciled by webhook." }, { status: 503 });
  }
  const completed = await markPaymentCaptured(payment.order.id, result.razorpay_payment_id);
  if (!completed.ok) return NextResponse.json({ error: "Payment could not be matched to an active order." }, { status: 409 });
  await clearSignedInCart(session.user.id);
  return NextResponse.json({ orderId: payment.order.id }, { headers: { "Cache-Control": "no-store" } });
}
