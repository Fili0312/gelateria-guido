-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PIECE', 'MG', 'G', 'HG', 'KG', 'ML', 'CL', 'DL', 'L');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('PIECE', 'KG', 'L');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('PER_PIECE', 'PER_KG', 'PER_L');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LISTINO', 'PREVENTIVO', 'ORDINE_VENDITA', 'CATALOGO');

-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'EXTRACTED', 'STRUCTURING', 'MATCHING', 'REVIEW', 'APPLYING', 'APPLIED', 'FAILED', 'DISCARDED', 'REVERTED');

-- CreateEnum
CREATE TYPE "ImportPhase" AS ENUM ('QUEUED', 'EXTRACTING', 'SEGMENTING', 'STRUCTURING', 'VALIDATING', 'MATCHING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RowSource" AS ENUM ('PROFILE', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('AUTO', 'PENDING', 'NEW', 'CONFIRMED', 'REJECTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ProposedAction" AS ENUM ('CREATE', 'UPDATE_PRICE', 'UNCHANGED', 'PACKAGING_CHANGED', 'AMBIGUOUS', 'IGNORE');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('GTIN', 'CODE', 'ALIAS', 'TRIGRAM', 'LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('SUPPLIER', 'USER', 'AI');

-- CreateEnum
CREATE TYPE "CreatedBy" AS ENUM ('USER', 'AI', 'IMPORT');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('PRICE_LIST', 'MANUAL', 'ORDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SENT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MailMode" AS ENUM ('LOG', 'SMTP');

-- CreateEnum
CREATE TYPE "AiPurpose" AS ENUM ('INFER_PROFILE', 'EXTRACT_ROWS', 'MATCH_PRODUCT', 'ANOMALY');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "vat_number" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contact_name" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "prices_include_vat" BOOLEAN NOT NULL DEFAULT false,
    "default_vat_rate" DECIMAL(5,2),
    "min_order_value" DECIMAL(12,2),
    "delivery_days" TEXT,
    "order_email" TEXT,
    "order_email_cc" TEXT,
    "send_orders_by_email" BOOLEAN NOT NULL DEFAULT false,
    "email_note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "page_count" INTEGER,
    "document_type" "DocumentType" NOT NULL DEFAULT 'LISTINO',
    "scope_label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "valid_from" DATE,
    "valid_to" DATE,
    "status" "PriceListStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractor_version" TEXT,
    "stats" JSONB,
    "error" TEXT,
    "uploaded_by_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "reverted_at" TIMESTAMP(3),

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_row" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "raw_text" TEXT NOT NULL,
    "raw_cells" JSONB,
    "bbox" JSONB,
    "source" "RowSource" NOT NULL DEFAULT 'PROFILE',
    "extracted" JSONB,
    "confidence" DECIMAL(4,3),
    "validation_errors" JSONB,
    "match_status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_action" "ProposedAction" NOT NULL DEFAULT 'AMBIGUOUS',
    "supplier_product_id" TEXT,
    "product_id" TEXT,
    "ai_call_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_import_profile" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "scope_label" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "column_mapping" JSONB NOT NULL,
    "row_regex" TEXT,
    "header_patterns" JSONB,
    "unit_hints" JSONB,
    "created_by" "RowSource" NOT NULL DEFAULT 'AI',
    "sample_row_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_import_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "phase" "ImportPhase" NOT NULL DEFAULT 'QUEUED',
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "unit_size" DECIMAL(12,4) NOT NULL,
    "unit_of_measure" "UnitOfMeasure" NOT NULL,
    "base_unit" "BaseUnit" NOT NULL,
    "gtin" TEXT,
    "image_path" TEXT,
    "normalized_name" TEXT NOT NULL,
    "created_by" "CreatedBy" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_code" TEXT,
    "raw_name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "pack_quantity" INTEGER NOT NULL DEFAULT 1,
    "pack_quantity_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "unit_size" DECIMAL(12,4) NOT NULL,
    "unit_of_measure" "UnitOfMeasure" NOT NULL,
    "packaging_type" TEXT,
    "content_per_pack" DECIMAL(14,6) NOT NULL,
    "base_unit" "BaseUnit" NOT NULL,
    "vat_rate" DECIMAL(5,2),
    "gtin" TEXT,
    "image_path" TEXT,
    "fingerprint" TEXT NOT NULL,
    "product_id" TEXT,
    "match_status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "match_confidence" DECIMAL(4,3),
    "current_price_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_price_list_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "disappeared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_alias" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "source" "AliasSource" NOT NULL DEFAULT 'USER',
    "negative" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_match_candidate" (
    "id" TEXT NOT NULL,
    "supplier_product_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "score" DECIMAL(4,3) NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "reason" TEXT,
    "ai_call_id" TEXT,
    "decided" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_match_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_price" (
    "id" TEXT NOT NULL,
    "supplier_product_id" TEXT NOT NULL,
    "price_list_id" TEXT,
    "price_list" DECIMAL(12,4) NOT NULL,
    "discounts" JSONB NOT NULL DEFAULT '[]',
    "price_net" DECIMAL(12,4) NOT NULL,
    "vat_rate" DECIMAL(5,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "unit_price" DECIMAL(14,6) NOT NULL,
    "unit_price_basis" "PriceBasis" NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "source" "PriceSource" NOT NULL DEFAULT 'PRICE_LIST',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_product_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_best_offer" (
    "product_id" TEXT NOT NULL,
    "best_supplier_product_id" TEXT NOT NULL,
    "best_unit_price" DECIMAL(14,6) NOT NULL,
    "best_price_net" DECIMAL(12,4) NOT NULL,
    "offers_count" INTEGER NOT NULL,
    "spread_pct" DECIMAL(6,2),
    "comparable" BOOLEAN NOT NULL DEFAULT true,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_best_offer_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "supplier_product_id" TEXT NOT NULL,
    "product_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "price_id" TEXT,
    "quantity_packs" INTEGER NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "supplier_name_snapshot" TEXT NOT NULL,
    "supplier_code_snapshot" TEXT,
    "pack_quantity_snapshot" INTEGER NOT NULL,
    "unit_size_snapshot" DECIMAL(12,4) NOT NULL,
    "uom_snapshot" "UnitOfMeasure" NOT NULL,
    "unit_price_net_snapshot" DECIMAL(12,4) NOT NULL,
    "vat_rate_snapshot" DECIMAL(5,2),
    "unit_price_basis_snapshot" "PriceBasis" NOT NULL,
    "line_total_net" DECIMAL(12,2) NOT NULL,
    "line_total_gross" DECIMAL(12,2) NOT NULL,
    "best_alternative_snapshot" JSONB,
    "override_reason" TEXT,
    "position" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_document" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "format" "DocumentFormat" NOT NULL,
    "template_key" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "document_id" TEXT,
    "to_address" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "mode" "MailMode" NOT NULL DEFAULT 'LOG',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" "AiPurpose" NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "price_list_id" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cache" (
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "setting" (
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("organization_id","key")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "user_organization_id_idx" ON "user"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_organization_id_email_key" ON "user"("organization_id", "email");

-- CreateIndex
CREATE INDEX "supplier_organization_id_idx" ON "supplier"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_organization_id_name_key" ON "supplier"("organization_id", "name");

-- CreateIndex
CREATE INDEX "price_list_organization_id_idx" ON "price_list"("organization_id");

-- CreateIndex
CREATE INDEX "price_list_supplier_id_scope_label_applied_at_idx" ON "price_list"("supplier_id", "scope_label", "applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_supplier_id_file_hash_key" ON "price_list"("supplier_id", "file_hash");

-- CreateIndex
CREATE INDEX "price_list_row_price_list_id_match_status_idx" ON "price_list_row"("price_list_id", "match_status");

-- CreateIndex
CREATE INDEX "price_list_row_price_list_id_proposed_action_idx" ON "price_list_row"("price_list_id", "proposed_action");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_row_price_list_id_page_number_line_number_key" ON "price_list_row"("price_list_id", "page_number", "line_number");

-- CreateIndex
CREATE INDEX "supplier_import_profile_supplier_id_active_idx" ON "supplier_import_profile"("supplier_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_import_profile_supplier_id_scope_label_version_key" ON "supplier_import_profile"("supplier_id", "scope_label", "version");

-- CreateIndex
CREATE UNIQUE INDEX "import_job_price_list_id_key" ON "import_job"("price_list_id");

-- CreateIndex
CREATE INDEX "import_job_phase_idx" ON "import_job"("phase");

-- CreateIndex
CREATE INDEX "product_organization_id_idx" ON "product"("organization_id");

-- CreateIndex
CREATE INDEX "product_organization_id_normalized_name_idx" ON "product"("organization_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_current_price_id_key" ON "supplier_product"("current_price_id");

-- CreateIndex
CREATE INDEX "supplier_product_organization_id_idx" ON "supplier_product"("organization_id");

-- CreateIndex
CREATE INDEX "supplier_product_supplier_id_active_idx" ON "supplier_product"("supplier_id", "active");

-- CreateIndex
CREATE INDEX "supplier_product_product_id_idx" ON "supplier_product"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_supplier_id_supplier_code_key" ON "supplier_product"("supplier_id", "supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_supplier_id_fingerprint_key" ON "supplier_product"("supplier_id", "fingerprint");

-- CreateIndex
CREATE INDEX "product_alias_normalized_text_idx" ON "product_alias"("normalized_text");

-- CreateIndex
CREATE UNIQUE INDEX "product_alias_product_id_normalized_text_key" ON "product_alias"("product_id", "normalized_text");

-- CreateIndex
CREATE INDEX "product_match_candidate_supplier_product_id_decided_idx" ON "product_match_candidate"("supplier_product_id", "decided");

-- CreateIndex
CREATE UNIQUE INDEX "product_match_candidate_supplier_product_id_product_id_key" ON "product_match_candidate"("supplier_product_id", "product_id");

-- CreateIndex
CREATE INDEX "supplier_product_price_supplier_product_id_valid_to_idx" ON "supplier_product_price"("supplier_product_id", "valid_to");

-- CreateIndex
CREATE INDEX "supplier_product_price_supplier_product_id_valid_from_idx" ON "supplier_product_price"("supplier_product_id", "valid_from");

-- CreateIndex
CREATE INDEX "supplier_product_price_price_list_id_idx" ON "supplier_product_price"("price_list_id");

-- CreateIndex
CREATE INDEX "product_best_offer_best_unit_price_idx" ON "product_best_offer"("best_unit_price");

-- CreateIndex
CREATE INDEX "order_organization_id_status_idx" ON "order"("organization_id", "status");

-- CreateIndex
CREATE INDEX "order_organization_id_confirmed_at_idx" ON "order"("organization_id", "confirmed_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_organization_id_code_key" ON "order"("organization_id", "code");

-- CreateIndex
CREATE INDEX "order_line_order_id_idx" ON "order_line"("order_id");

-- CreateIndex
CREATE INDEX "order_line_supplier_product_id_idx" ON "order_line"("supplier_product_id");

-- CreateIndex
CREATE INDEX "order_line_product_id_idx" ON "order_line"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_order_id_supplier_product_id_key" ON "order_line"("order_id", "supplier_product_id");

-- CreateIndex
CREATE INDEX "order_document_order_id_idx" ON "order_document"("order_id");

-- CreateIndex
CREATE INDEX "email_delivery_status_idx" ON "email_delivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_order_id_supplier_id_key" ON "email_delivery"("order_id", "supplier_id");

-- CreateIndex
CREATE INDEX "ai_call_organization_id_created_at_idx" ON "ai_call"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_price_list_id_idx" ON "ai_call"("price_list_id");

-- CreateIndex
CREATE INDEX "ai_cache_created_at_idx" ON "ai_cache"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_row" ADD CONSTRAINT "price_list_row_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_row" ADD CONSTRAINT "price_list_row_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_row" ADD CONSTRAINT "price_list_row_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_row" ADD CONSTRAINT "price_list_row_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_import_profile" ADD CONSTRAINT "supplier_import_profile_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_last_seen_price_list_id_fkey" FOREIGN KEY ("last_seen_price_list_id") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_current_price_id_fkey" FOREIGN KEY ("current_price_id") REFERENCES "supplier_product_price"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alias" ADD CONSTRAINT "product_alias_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_alias" ADD CONSTRAINT "product_alias_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_match_candidate" ADD CONSTRAINT "product_match_candidate_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_match_candidate" ADD CONSTRAINT "product_match_candidate_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_match_candidate" ADD CONSTRAINT "product_match_candidate_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_price" ADD CONSTRAINT "supplier_product_price_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_price" ADD CONSTRAINT "supplier_product_price_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_price" ADD CONSTRAINT "supplier_product_price_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_best_offer" ADD CONSTRAINT "product_best_offer_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_best_offer" ADD CONSTRAINT "product_best_offer_best_supplier_product_id_fkey" FOREIGN KEY ("best_supplier_product_id") REFERENCES "supplier_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_supplier_product_id_fkey" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "supplier_product_price"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_document" ADD CONSTRAINT "order_document_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_document" ADD CONSTRAINT "order_document_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_document" ADD CONSTRAINT "order_document_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "order_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════
--  Ciò che Prisma non sa esprimere
-- ═══════════════════════════════════════════════════════════════════════

-- Indici trigram per la ricerca fuzzy.
--
-- Servono a due cose diverse che finiscono nello stesso posto: la barra di
-- ricerca della schermata ordine (Fase 12) e la generazione dei candidati di
-- abbinamento (Fase 9). Senza questi, cercare "birra" su qualche migliaio di
-- prodotti diventa una scansione sequenziale.
CREATE INDEX "product_normalized_name_trgm_idx"
  ON "product" USING GIN ("normalized_name" gin_trgm_ops);

CREATE INDEX "product_alias_normalized_text_trgm_idx"
  ON "product_alias" USING GIN ("normalized_text" gin_trgm_ops);

CREATE INDEX "supplier_product_raw_name_trgm_idx"
  ON "supplier_product" USING GIN ("raw_name" gin_trgm_ops);

-- Il codice del fornitore si cerca a pezzi ("cerca 7A07"), quindi serve
-- anche qui il trigram e non un semplice btree.
CREATE INDEX "supplier_product_code_trgm_idx"
  ON "supplier_product" USING GIN ("supplier_code" gin_trgm_ops);

-- Due invarianti che il database difende da solo.
--
-- Si potrebbero controllare nel codice, ma il codice si dimentica: basta un
-- import che va in errore a metà, o due richieste in parallelo, e ci si
-- ritrova con due prezzi correnti per lo stesso prodotto — cioè con un
-- confronto che a seconda della query dice due cose diverse.

-- Un solo prezzo aperto (valid_to IS NULL) per prodotto fornitore.
CREATE UNIQUE INDEX "supplier_product_price_un_solo_corrente"
  ON "supplier_product_price" ("supplier_product_id")
  WHERE "valid_to" IS NULL;

-- Un solo ordine in bozza per utente: il carrello è uno.
CREATE UNIQUE INDEX "order_una_sola_bozza_per_utente"
  ON "order" ("created_by_id")
  WHERE "status" = 'DRAFT';
