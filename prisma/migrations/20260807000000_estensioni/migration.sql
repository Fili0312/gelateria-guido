-- Estensioni Postgres su cui poggia l'applicazione.
--
-- pg_trgm   : ricerca fuzzy dei prodotti (la barra di ricerca della schermata
--             ordine, e la generazione dei candidati di abbinamento in Fase 9).
-- unaccent  : "però" e "pero" devono trovarsi a vicenda.
-- pgcrypto  : hash e generazione di identificatori.
-- btree_gin : indici combinati fra colonne normali e indici GIN, per poter
--             filtrare per organizzazione *dentro* una ricerca trigram.
--
-- Sono tutte estensioni "trusted" su PostgreSQL 16: le può creare il ruolo
-- dell'applicazione, senza privilegi di superutente. Verificato sul server.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;
