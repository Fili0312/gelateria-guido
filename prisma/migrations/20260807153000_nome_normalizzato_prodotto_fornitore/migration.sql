-- Fase 5: il nome normalizzato diventa una colonna di `supplier_product`.
--
-- Serve alla ricerca del catalogo e, dalla Fase 9, alla generazione dei
-- candidati di abbinamento. Sul nome grezzo il trigram gia' ignora le
-- maiuscole, ma non gli accenti: "cuvee" non troverebbe "cuvée".
--
-- La colonna e' NOT NULL, ma va aggiunta in tre tempi perche' la tabella puo'
-- gia' contenere righe. Su un'installazione da zero la tabella e' vuota e il
-- passo 2 non tocca nulla.

-- 1. Colonna nullable.
ALTER TABLE "supplier_product" ADD COLUMN "normalized_name" TEXT;

-- 2. Riempimento di ripiego per le righe gia' presenti.
--
--    Questa e' un'APPROSSIMAZIONE in SQL: minuscolo, senza accenti, la
--    punteggiatura ridotta a spazi. Non espande le abbreviazioni e non toglie
--    i token di formato, cose che sa fare solo `normalizzaTesto` in
--    TypeScript. Serve unicamente a poter mettere il vincolo NOT NULL senza
--    perdere righe: subito dopo la migrazione va eseguito
--    `pnpm ricalcola-normalizzati`, che riscrive i valori con la funzione
--    canonica. Tenere due implementazioni divergenti sarebbe la premessa di
--    una ricerca che trova cose diverse a seconda di quando e' stata scritta
--    la riga.
UPDATE "supplier_product"
SET "normalized_name" = btrim(regexp_replace(lower(unaccent("raw_name")), '[^a-z0-9]+', ' ', 'g'))
WHERE "normalized_name" IS NULL;

-- Nessun nome puo' ridursi a stringa vuota: se succedesse, meglio un valore
-- riconoscibile che una riga invisibile a ogni ricerca.
UPDATE "supplier_product"
SET "normalized_name" = 'senza nome'
WHERE btrim(coalesce("normalized_name", '')) = '';

-- 3. Vincolo definitivo.
ALTER TABLE "supplier_product" ALTER COLUMN "normalized_name" SET NOT NULL;

-- L'indice trigram si sposta dal nome grezzo a quello normalizzato: coprono
-- le stesse ricerche, ma il secondo le copre anche con gli accenti.
DROP INDEX "supplier_product_raw_name_trgm_idx";

CREATE INDEX "supplier_product_normalized_name_trgm_idx"
  ON "supplier_product" USING GIN ("normalized_name" gin_trgm_ops);
