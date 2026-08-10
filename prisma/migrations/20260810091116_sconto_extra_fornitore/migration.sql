-- AlterTable
ALTER TABLE "supplier" ADD COLUMN     "extra_discount_note" TEXT,
ADD COLUMN     "extra_discount_pct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "supplier_product" ADD COLUMN     "extra_discount_excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extra_discount_pct" DECIMAL(5,2);

