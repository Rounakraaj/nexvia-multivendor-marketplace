ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key"
ON "Order"("customerId", "idempotencyKey");
