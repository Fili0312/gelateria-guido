-- CreateEnum
CREATE TYPE "PriceListMode" AS ENUM ('FULL', 'PARTIAL');

-- AlterTable
ALTER TABLE "price_list" ADD COLUMN     "mode" "PriceListMode" NOT NULL DEFAULT 'FULL';

