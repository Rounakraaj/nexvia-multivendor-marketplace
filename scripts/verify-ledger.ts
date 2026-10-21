import "dotenv/config";
import { db } from "../src/lib/db";

const cents = (d: unknown) => Math.round(Number(d) * 100);

async function main() {
  let failures = 0;
  const fail = (m: string) => {
    failures++;
    console.log("FAIL", m);
  };

  const orders = await db.order.findMany({ include: { items: true, payment: true } });
  for (const o of orders) {
    let gross = 0;
    let allocatedDiscount = 0;
    for (const i of o.items) {
      const line = cents(i.price) * i.qty;
      gross += line;
      allocatedDiscount += cents(i.discount);
      if (cents(i.commission) + cents(i.vendorEarning) + cents(i.vendorDiscount) !== line) {
        fail(`Item ${i.id}: commission, seller earnings, and vendor-funded discount differ from the line total`);
      }
      if ((o.couponFunding === "VENDOR" && cents(i.discount) !== cents(i.vendorDiscount)) || (o.couponFunding !== "VENDOR" && cents(i.vendorDiscount) !== 0)) fail(`Item ${i.id}: discount funding does not match the order coupon funding`);
    }
    if (gross !== cents(o.subtotal)) fail(`Order ${o.id}: subtotal differs from its line items`);
    if (cents(o.subtotal) - cents(o.discountTotal) !== cents(o.total)) fail(`Order ${o.id}: subtotal less discounts differs from the payable total`);
    if (allocatedDiscount !== cents(o.discountTotal)) fail(`Order ${o.id}: allocated item discounts differ from the order discount`);
    if (!o.couponCode && (cents(o.discountTotal) !== 0 || o.couponFunding !== null)) fail(`Order ${o.id}: discount exists without a coupon`);
    if (o.payment && cents(o.payment.amount) !== cents(o.total)) fail(`Order ${o.id}: recorded payment amount differs from order total`);
    if (o.status === "PAID" && o.payment?.provider === "RAZORPAY" && o.payment.status !== "CAPTURED") fail(`Order ${o.id}: Razorpay order is paid without a captured payment`);
  }

  const vendors = await db.vendor.findMany();
  const creditedStatuses = ["PAID", "PACKED", "SHIPPED", "DELIVERED"] as const;
  for (const v of vendors) {
    const items = await db.orderItem.findMany({
      where: { vendorId: v.id, order: { status: { in: [...creditedStatuses] } } },
    });
    const earned = items.reduce((n, i) => n + cents(i.vendorEarning), 0);
    if (earned !== cents(v.balance)) {
      fail(`Vendor ${v.shopName}: balance ${v.balance} differs from earnings ${earned / 100}`);
    }
  }

  const duplicateIdempotencyKeys = await db.$queryRaw<{ customerId: string; idempotencyKey: string; count: bigint }[]>`
    SELECT "customerId", "idempotencyKey", COUNT(*) AS count
    FROM "Order"
    WHERE "idempotencyKey" IS NOT NULL
    GROUP BY "customerId", "idempotencyKey"
    HAVING COUNT(*) > 1
  `;
  for (const duplicate of duplicateIdempotencyKeys) fail(`Customer ${duplicate.customerId}: idempotency key ${duplicate.idempotencyKey} occurs more than once`);

  console.log(failures === 0 ? `PASS: ${orders.length} orders and idempotency keys checked` : `${failures} problems found`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
