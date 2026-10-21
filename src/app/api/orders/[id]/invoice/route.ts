import PDFDocument from "pdfkit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !["CUSTOMER", "ADMIN"].includes(session.user.role)) return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, ...(session.user.role === "CUSTOMER" ? { customerId: session.user.id } : {}) },
    include: { customer: { select: { name: true, email: true } }, items: { include: { product: { select: { title: true } }, vendor: { select: { shopName: true } } } }, payment: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Nexvia invoice ${order.id}`, Author: "Nexvia Market" } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fontSize(22).fillColor("#13213a").text("NEXVIA MARKET", { continued: true });
  doc.fontSize(10).fillColor("#64748b").text("  ·  ORDER INVOICE", { align: "right" });
  doc.moveDown(1.5).fontSize(18).fillColor("#13213a").text("Invoice");
  doc.fontSize(10).fillColor("#334155").text(`Order: ${order.id}`);
  doc.text(`Date: ${order.createdAt.toLocaleDateString("en-IN")}`);
  doc.text(`Payment: ${order.payment?.status ?? order.status}`);
  doc.moveDown().fontSize(12).fillColor("#13213a").text("Billed to");
  doc.fontSize(10).fillColor("#334155").text(order.shippingName ?? order.customer.name);
  doc.text(order.customer.email);
  if (order.shippingPhone) doc.text(order.shippingPhone);
  if (order.shippingAddress) doc.text(order.shippingAddress, { width: 300 });
  doc.moveDown(1.5).fontSize(10).fillColor("#13213a");
  doc.text("Item", 48, doc.y, { width: 230, continued: true });
  doc.text("Shop", { width: 120, continued: true });
  doc.text("Qty", { width: 45, continued: true, align: "right" });
  doc.text("Amount", { align: "right" });
  doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor("#cbd5e1").stroke();
  doc.moveDown(0.8).fillColor("#334155");
  for (const item of order.items) {
    const y = doc.y;
    doc.text(item.product.title, 48, y, { width: 230 });
    doc.text(item.vendor.shopName, 278, y, { width: 120 });
    doc.text(String(item.qty), 400, y, { width: 45, align: "right" });
    doc.text(formatPrice(Number(item.price) * item.qty), 450, y, { width: 97, align: "right" });
    doc.moveDown(0.8);
  }
  doc.moveDown().fontSize(10).fillColor("#334155");
  doc.text(`Subtotal  ${formatPrice(Number(order.subtotal))}`, { align: "right" });
  if (Number(order.discountTotal) > 0) doc.text(`Discount${order.couponCode ? ` (${order.couponCode})` : ""}  −${formatPrice(Number(order.discountTotal))}`, { align: "right" });
  doc.moveDown(0.4).fontSize(14).fillColor("#13213a").text(`Order total  ${formatPrice(Number(order.total))}`, { align: "right" });
  doc.moveDown(2).fontSize(9).fillColor("#64748b").text("Thank you for shopping with Nexvia Market. This invoice was generated electronically.");
  doc.end();
  const bytes = await output;
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="nexvia-invoice-${order.id.slice(-8)}.pdf"`, "Cache-Control": "private, no-store" } });
}
