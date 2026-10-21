CREATE TYPE "CouponFunding" AS ENUM ('PLATFORM', 'VENDOR');

ALTER TABLE "Order"
    ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "couponCode" TEXT,
    ADD COLUMN "couponFunding" "CouponFunding",
    ADD COLUMN "couponReservationKey" TEXT;

UPDATE "Order" SET "subtotal" = "total" WHERE "subtotal" = 0;

ALTER TABLE "OrderItem"
    ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vendorDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;
