-- Fase 4: le regole dell'anagrafica devono valere anche per scritture che non
-- passano dalla UI. Gli indirizzi email restano validati dall'applicazione;
-- qui proteggiamo gli invarianti che PostgreSQL puo' esprimere con certezza.

CREATE UNIQUE INDEX "supplier_organization_id_name_ci_key"
  ON "supplier" ("organization_id", lower(btrim("name")));

ALTER TABLE "supplier"
  ADD CONSTRAINT "supplier_name_not_blank"
    CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "supplier_default_vat_rate_range"
    CHECK ("default_vat_rate" IS NULL OR
      ("default_vat_rate" >= 0 AND "default_vat_rate" <= 100)),
  ADD CONSTRAINT "supplier_min_order_value_non_negative"
    CHECK ("min_order_value" IS NULL OR "min_order_value" >= 0),
  ADD CONSTRAINT "supplier_order_email_required_when_enabled"
    CHECK (NOT "send_orders_by_email" OR
      ("order_email" IS NOT NULL AND btrim("order_email") <> ''));
