-- migrate:up
-- =============================================================================
-- Ingestions (suivi des exécutions du pipeline)
-- -----------------------------------------------------------------------------
-- Une ingestion traite un fichier source précis, donc une édition précise.
-- index_id = index vectoriel alimenté par cette exécution (modèle, collection
-- et découpage y sont décrits) ; NULL si l'exécution n'a fait qu'extraire le
-- texte (segments) sans vectoriser.
-- =============================================================================
CREATE TYPE ingestion_status AS ENUM ('pending', 'running', 'succeeded', 'failed');

CREATE TABLE ingestions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id   UUID REFERENCES editions (id) ON DELETE SET NULL,
    index_id     UUID REFERENCES vector_indexes (id) ON DELETE SET NULL,
    source_file  TEXT NOT NULL,
    status       ingestion_status NOT NULL DEFAULT 'pending',
    n_segments   INTEGER NOT NULL DEFAULT 0,
    n_chunks     INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX ingestions_edition_idx ON ingestions (edition_id);
CREATE INDEX ingestions_index_idx ON ingestions (index_id);
CREATE INDEX ingestions_status_idx ON ingestions (status);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
