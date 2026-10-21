ALTER TABLE "Order"
ADD COLUMN "shippingName" TEXT,
ADD COLUMN "shippingPhone" TEXT,
ADD COLUMN "shippingAddress" TEXT;

CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "OrderItem_vendorId_orderId_idx" ON "OrderItem"("vendorId", "orderId");
