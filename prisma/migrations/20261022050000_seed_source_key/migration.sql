ALTER TABLE "Product" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "Product_sourceKey_key" ON "Product"("sourceKey");
