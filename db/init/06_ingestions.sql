-- =============================================================================
-- Ingestions (suivi des exécutions du pipeline)
-- -----------------------------------------------------------------------------
-- Une ingestion traite un fichier source précis, donc une édition précise.
-- =============================================================================
CREATE TYPE ingestion_status AS ENUM ('pending', 'running', 'succeeded', 'failed');

CREATE TABLE ingestions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id   UUID REFERENCES editions (id) ON DELETE SET NULL,
    source_file  TEXT NOT NULL,
    status       ingestion_status NOT NULL DEFAULT 'pending',
    n_chunks     INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX ingestions_edition_idx ON ingestions (edition_id);
CREATE INDEX ingestions_status_idx ON ingestions (status);
