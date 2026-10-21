import "dotenv/config";
import Fastify from "fastify";
import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { verifyServiceToken } from "@/lib/api-service-auth";
import { markPaymentCaptured, markPaymentFailed, refundGatewayPayment } from "@/lib/payments";
import { toPaise } from "@/lib/money";
import { getRecentActivity, getZeroResultQueryStats } from "@/lib/mongo";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
type Principal = { sub: string; role: string };
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  const principal = verifyServiceToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
  if (!principal) return reply.code(401).send({ error: "Unauthorized service request." });
  (request as typeof request & { principal: Principal }).principal = principal;
});
app.get("/health", async () => ({ status: "ok", service: "nexvia-api" }));

app.post<{ Body: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } } } } }>("/v1/payments/webhook", async (request, reply) => {
  if ((request as typeof request & { principal: Principal }).principal.role !== "SYSTEM") return reply.code(403).send({ error: "Forbidden." });
  const event = request.body;
  const entity = event?.payload?.payment?.entity;
  if (!entity?.order_id) return { received: true };
  const payment = await db.payment.findUnique({ where: { gatewayOrderId: entity.order_id }, select: { orderId: true } });
  if (!payment) return { received: true };
  if (event.event === "payment.captured" && entity.id) {
    const result = await markPaymentCaptured(payment.orderId, entity.id);
    if (!result.ok) {
      const cancelled = await db.payment.findUnique({ where: { orderId: payment.orderId }, include: { order: { select: { status: true } } } });
      if (cancelled?.provider === "RAZORPAY" && cancelled.status === "CANCELLED" && cancelled.order.status === "CANCELLED") {
        const claim = await db.payment.updateMany({ where: { id: cancelled.id, status: "CANCELLED" }, data: { status: "REFUND_PENDING" } });
        if (claim.count === 1) {
          try {
            const refundId = await refundGatewayPayment(entity.id, payment.orderId, toPaise(cancelled.amount.toString()));
            await db.payment.update({ where: { id: cancelled.id }, data: { status: "REFUNDED", gatewayPaymentId: entity.id, gatewayRefundId: refundId } });
          } catch (error) {
            await db.payment.updateMany({ where: { id: cancelled.id, status: "REFUND_PENDING", gatewayRefundId: null }, data: { status: "CANCELLED" } });
            throw error;
          }
        }
      }
    }
  } else if (event.event === "payment.failed") await markPaymentFailed(payment.orderId, entity.error_description ?? "Razorpay reported a failed payment.");
  return { received: true };
});

app.get<{ Params: { id: string } }>("/v1/orders/:id/invoice", async (request, reply) => {
  const principal = (request as typeof request & { principal: Principal }).principal;
  if (!["CUSTOMER", "ADMIN"].includes(principal.role)) return reply.code(403).send({ error: "Forbidden." });
  const order = await db.order.findFirst({ where: { id: request.params.id, ...(principal.role === "CUSTOMER" ? { customerId: principal.sub } : {}) }, include: { customer: { select: { name: true, email: true } }, items: { include: { product: { select: { title: true } }, vendor: { select: { shopName: true } } } }, payment: true } });
  if (!order) return reply.code(404).send({ error: "Order not found." });
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(22).fillColor("#13213a").text("NEXVIA MARKET").moveDown().fontSize(18).text("Invoice");
  doc.fontSize(10).fillColor("#334155").text(`Order: ${order.id}`).text(`Date: ${order.createdAt.toLocaleDateString("en-IN")}`).text(`Payment: ${order.payment?.status ?? order.status}`).moveDown().fontSize(12).text("Billed to");
  doc.fontSize(10).text(order.shippingName ?? order.customer.name).text(order.customer.email);
  if (order.shippingAddress) doc.text(order.shippingAddress, { width: 300 });
  doc.moveDown().text("Item                                      Shop                Qty              Amount").moveDown(0.5);
  for (const item of order.items) doc.text(`${item.product.title}  |  ${item.vendor.shopName}  |  ${item.qty}  |  INR ${(Number(item.price) * item.qty).toFixed(2)}`);
  doc.moveDown().fontSize(12).text(`Order total: INR ${Number(order.total).toFixed(2)}`, { align: "right" }).end();
  const bytes = await output;
  return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="nexvia-invoice-${order.id.slice(-8)}.pdf"`).header("cache-control", "private, no-store").send(bytes);
});

app.get("/v1/admin/analytics", async (request, reply) => {
  if ((request as typeof request & { principal: Principal }).principal.role !== "ADMIN") return reply.code(403).send({ error: "Forbidden." });
  const [orders, lowStock, zeroQueries, activity] = await Promise.all([
    db.order.findMany({ where: { status: { in: ["PAID", "PACKED", "SHIPPED", "DELIVERED"] } }, select: { id: true, subtotal: true, items: { select: { commission: true } } } }),
    db.product.count({ where: { stock: { lte: 5 }, vendor: { approved: true } } }), getZeroResultQueryStats(30, 10), getRecentActivity(20),
  ]);
  const grossSales = orders.reduce((sum, order) => sum + Number(order.subtotal), 0);
  const commission = orders.reduce((sum, order) => sum + order.items.reduce((inner, item) => inner + Number(item.commission), 0), 0);
  return { grossSales, paidOrders: orders.length, commission, lowStockProducts: lowStock, zeroQueries, activity: activity?.map((item) => ({ ...item, _id: String(item._id), createdAt: item.createdAt.toISOString() })) ?? null };
});

const port = Number(process.env.API_SERVICE_PORT ?? 4100);
app.listen({ port, host: process.env.API_SERVICE_HOST ?? "127.0.0.1" }).catch((error) => {
  app.log.error(error);
  process.exitCode = 1;
});
