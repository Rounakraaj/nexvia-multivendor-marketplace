import { NextResponse } from "next/server";
import { markPaymentCaptured, markPaymentFailed, refundGatewayPayment, verifyWebhookSignature } from "@/lib/payments";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/money";
import { callApiService } from "@/lib/api-service-auth";

type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } } };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  let event: RazorpayEvent;
  try { event = JSON.parse(rawBody) as RazorpayEvent; } catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const serviceResponse = await callApiService("/v1/payments/webhook", { sub: "razorpay", role: "SYSTEM" }, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  if (serviceResponse) return new Response(await serviceResponse.text(), { status: serviceResponse.status, headers: { "content-type": serviceResponse.headers.get("content-type") ?? "application/json" } });
  const paymentEntity = event.payload?.payment?.entity;
  if (!paymentEntity?.order_id) return NextResponse.json({ received: true });
  const payment = await db.payment.findUnique({ where: { gatewayOrderId: paymentEntity.order_id }, select: { orderId: true } });
  if (!payment) return NextResponse.json({ received: true });
  if (event.event === "payment.captured" && paymentEntity.id) {
    const result = await markPaymentCaptured(payment.orderId, paymentEntity.id);
    if (!result.ok) {
      const cancelled = await db.payment.findUnique({ where: { orderId: payment.orderId }, include: { order: { select: { status: true } } } });
      if (cancelled?.provider === "RAZORPAY" && cancelled.status === "CANCELLED" && cancelled.order.status === "CANCELLED") {
        const claim = await db.payment.updateMany({ where: { id: cancelled.id, status: "CANCELLED" }, data: { status: "REFUND_PENDING" } });
        if (claim.count === 1) {
          try {
            const refundId = await refundGatewayPayment(paymentEntity.id, payment.orderId, toPaise(cancelled.amount.toString()));
            await db.payment.update({ where: { id: cancelled.id }, data: { status: "REFUNDED", gatewayPaymentId: paymentEntity.id, gatewayRefundId: refundId } });
          } catch (error) {
            await db.payment.updateMany({ where: { id: cancelled.id, status: "REFUND_PENDING", gatewayRefundId: null }, data: { status: "CANCELLED" } });
            throw error;
          }
        }
      }
    }
  } else if (event.event === "payment.failed") {
    await markPaymentFailed(payment.orderId, paymentEntity.error_description ?? "Razorpay reported a failed payment.");
  }
  return NextResponse.json({ received: true });
}
