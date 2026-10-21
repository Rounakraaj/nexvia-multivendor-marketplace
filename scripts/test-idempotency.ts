import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";

class RollbackProbe extends Error {}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function main() {
  const customer = await db.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } });
  if (!customer) throw new Error("Create a customer account before running this database integration check.");
  try {
    await db.$transaction(async (tx) => {
      const idempotencyKey = randomUUID();
      const order = await tx.order.create({ data: { customerId: customer.id, total: 0, idempotencyKey }, select: { id: true } });
      await tx.$executeRaw`SAVEPOINT duplicate_idempotency_probe`;
      let rejectedDuplicate = false;
      try {
        await tx.order.create({ data: { customerId: customer.id, total: 0, idempotencyKey } });
      } catch (error) {
        rejectedDuplicate = isUniqueViolation(error);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT duplicate_idempotency_probe`;
      }
      const existing = await tx.order.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey } }, select: { id: true } });
      if (!rejectedDuplicate || existing?.id !== order.id) throw new Error("The database did not preserve exactly one order for a repeated idempotency key.");
      throw new RollbackProbe("Rollback the temporary integration record.");
    });
  } catch (error) {
    if (!(error instanceof RollbackProbe)) throw error;
  }
  console.log("PASS: duplicate checkout idempotency keys resolve to one order");
}

main().catch((error) => {
  console.error("FAIL: checkout idempotency check", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
