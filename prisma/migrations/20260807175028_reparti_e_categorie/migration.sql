-- Reparti e categorie: la tassonomia in due livelli con cui si ordina.
--
-- Ordine dei passi, che non è casuale: si crea la struttura, si travasano i
-- dati. La vecchia colonna di testo libero resta per un ciclo di deploy come
-- rete di rollback: la build precedente continua così a funzionare anche
-- dopo la migrazione. Una migrazione di pulizia la eliminerà soltanto dopo
-- che questa release sarà stata verificata in produzione.

-- ─────────────────────────────────────────────────────────────────────────
--  1. Struttura
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "department_organization_id_sort_order_idx" ON "department"("organization_id", "sort_order");
CREATE INDEX "category_organization_id_idx" ON "category"("organization_id");
CREATE INDEX "category_department_id_sort_order_idx" ON "category"("department_id", "sort_order");

ALTER TABLE "department" ADD CONSTRAINT "department_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category" ADD CONSTRAINT "category_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product" ADD COLUMN "category_id" TEXT;
CREATE INDEX "product_organization_id_category_id_idx" ON "product"("organization_id", "category_id");
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
--  2. Tassonomia iniziale
--
--  Sta qui per le organizzazioni già presenti al deploy. Il seed usa la
--  stessa struttura soltanto quando crea un'organizzazione su un database
--  vuoto, cioè dopo che le migrazioni sono già passate. Da quel bootstrap in
--  avanti la tassonomia si modifica dall'interfaccia, non da questi file.
--
--  Le categorie di Bar sono quelle che compaiono davvero nei listini di
--  Barzelli e Cecconi; quelle di Gelateria e Cucina sono un punto di
--  partenza ragionevole, da correggere in Impostazioni.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "department" ("id", "organization_id", "name", "color", "sort_order", "updated_at")
SELECT gen_random_uuid()::text, o.id, r.nome, r.colore, r.ordine, now()
  FROM "organization" o
 CROSS JOIN (VALUES
        ('Bar',                '#b45309', 10),
        ('Gelateria',          '#be185d', 20),
        ('Cucina',             '#15803d', 30),
        ('Pulizia e consumo',  '#475569', 40)
      ) AS r(nome, colore, ordine);

INSERT INTO "category" ("id", "organization_id", "department_id", "name", "sort_order", "updated_at")
SELECT gen_random_uuid()::text, d.organization_id, d.id, c.nome, c.ordine, now()
  FROM "department" d
  JOIN (VALUES
        ('Bar',               'Acqua',                    10),
        ('Bar',               'Bibite',                   20),
        ('Bar',               'Birre',                    30),
        ('Bar',               'Aperitivi',                40),
        ('Bar',               'Amari e liquori',          50),
        ('Bar',               'Distillati',               60),
        ('Bar',               'Vini e spumanti',          70),
        ('Bar',               'Sciroppi',                 80),
        ('Bar',               'Caffè e infusi',           90),
        ('Bar',               'Snack e salatini',        100),

        ('Gelateria',         'Basi e semilavorati',      10),
        ('Gelateria',         'Latte, panna e uova',      20),
        ('Gelateria',         'Zucchero e neutri',        30),
        ('Gelateria',         'Paste e aromi',            40),
        ('Gelateria',         'Frutta e polpe',           50),
        ('Gelateria',         'Cioccolato e coperture',   60),
        ('Gelateria',         'Variegati e topping',      70),
        ('Gelateria',         'Frutta secca e granelle',  80),
        ('Gelateria',         'Coni, cialde e biscotti',  90),
        ('Gelateria',         'Vaschette e coppette',    100),

        ('Cucina',            'Farine e sfarinati',       10),
        ('Cucina',            'Conserve e sughi',         20),
        ('Cucina',            'Salumi e formaggi',        30),
        ('Cucina',            'Surgelati',                40),
        ('Cucina',            'Olio, aceto e spezie',     50),

        ('Pulizia e consumo', 'Detergenti e sanificanti', 10),
        ('Pulizia e consumo', 'Carta e tovaglioli',       20),
        ('Pulizia e consumo', 'Palette e cucchiaini',     30),
        ('Pulizia e consumo', 'Sacchetti e imballaggi',   40)
      ) AS c(reparto, nome, ordine)
    ON c.reparto = d.name;

-- ─────────────────────────────────────────────────────────────────────────
--  3. Travaso delle categorie a testo libero già presenti
--
--  Le otto voci mappate qui sotto sono quelle effettivamente in catalogo al
--  2026-08-07 (tutte di reparto Bar: i listini caricati finora sono di
--  bevande). Una riga con un testo non previsto non viene persa e non manda
--  in errore la migrazione: resta senza categoria, cioè finisce nella coda
--  «da classificare», che è visibile — al contrario di un'assegnazione
--  inventata, che sarebbe invisibile e sbagliata.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE "product" p
   SET "category_id" = c.id
  FROM (VALUES
        ('Acqua',      'Acqua'),
        ('Bibite',     'Bibite'),
        ('Birra',      'Birre'),
        ('Aperitivi',  'Aperitivi'),
        ('Amari',      'Amari e liquori'),
        ('Liquori',    'Amari e liquori'),
        ('Rum',        'Distillati'),
        ('Vodka',      'Distillati'),
        ('Gin',        'Distillati'),
        ('Whisky',     'Distillati'),
        ('Sciroppi',   'Sciroppi')
      ) AS m(vecchia, nuova)
  JOIN "category" c ON c.name = m.nuova
 WHERE c.organization_id = p.organization_id
   AND lower(btrim(p."category")) = lower(m.vecchia);

COMMENT ON COLUMN "product"."category" IS
  'Colonna legacy mantenuta temporaneamente per rollback; usare category_id.';

-- ─────────────────────────────────────────────────────────────────────────
--  4. Invarianti
--
--  Gli stessi che la Fase 4 ha messo sui fornitori, per lo stesso motivo: le
--  regole che PostgreSQL può garantire vanno garantite qui, così valgono
--  anche per una scrittura che non passa dall'interfaccia.
-- ─────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "department_organization_name_key"
    ON "department"("organization_id", lower(btrim("name")));
CREATE UNIQUE INDEX "category_department_name_key"
    ON "category"("department_id", lower(btrim("name")));

ALTER TABLE "department" ADD CONSTRAINT "department_name_non_vuoto"
    CHECK (btrim("name") <> '');
ALTER TABLE "category" ADD CONSTRAINT "category_name_non_vuoto"
    CHECK (btrim("name") <> '');

-- ─────────────────────────────────────────────────────────────────────────
--  5. Statistiche
--
--  Non è una formalità: la ricerca del catalogo fa due LEFT JOIN su queste
--  tabelle, e senza statistiche il pianificatore sceglie male. Misurato su
--  5.000 prodotti: mediana 45 ms senza ANALYZE, 20 ms con. Autovacuum ci
--  arriverebbe da solo, ma dopo — e il "dopo" è il primo giorno d'uso.
-- ─────────────────────────────────────────────────────────────────────────

ANALYZE "department", "category", "product";

-- Non c'è una foreign key composita a garantire che categoria e prodotto
-- appartengano alla stessa organizzazione, ed è una scelta: servirebbe una
-- seconda chiave esterna accanto a quella che Prisma già dichiara, e un
-- `ON DELETE SET NULL` su due colonne azzererebbe anche `organization_id`,
-- che è NOT NULL. Il vincolo vive quindi dove può vivere una volta sola —
-- nel repository, che verifica l'appartenenza prima di scrivere, con il suo
-- test — sopra il diniego di default dell'estensione di scoping.
