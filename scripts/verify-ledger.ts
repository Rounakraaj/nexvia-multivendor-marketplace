import "dotenv/config";
import { db } from "../src/lib/db";

const cents = (d: unknown) => Math.round(Number(d) * 100);

async function main() {
  let failures = 0;
  const fail = (m: string) => {
    failures++;
    console.log("FAIL", m);
  };

  const orders = await db.order.findMany({ include: { items: true } });
  for (const o of orders) {
    let sum = 0;
    for (const i of o.items) {
      const line = cents(i.price) * i.qty;
      sum += line;
      if (cents(i.commission) + cents(i.vendorEarning) !== line) {
        fail(`Item ${i.id}: commission plus earning differs from the line total`);
      }
    }
    if (sum !== cents(o.total)) fail(`Order ${o.id}: total differs from its line items`);
  }

  const vendors = await db.vendor.findMany();
  for (const v of vendors) {
    const items = await db.orderItem.findMany({
      where: { vendorId: v.id, order: { status: { not: "CANCELLED" } } },
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
