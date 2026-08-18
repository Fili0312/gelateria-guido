-- AlterTable
ALTER TABLE "product" ADD COLUMN     "image_source" TEXT,
ADD COLUMN     "image_external_id" TEXT,
ADD COLUMN     "image_confidence" DECIMAL(4,3),
ADD COLUMN     "image_updated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "product_organization_id_image_updated_at_idx" ON "product"("organization_id", "image_updated_at");
