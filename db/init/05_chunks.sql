-- =============================================================================
-- Chunks (miroir relationnel des points Qdrant)
-- -----------------------------------------------------------------------------
-- qdrant_point_id = identifiant du point vectoriel dans Qdrant.
-- Le texte est conservé ici pour l'affichage des citations et le debug.
-- Un chunk appartient à une édition précise (le texte dépend de la langue).
-- =============================================================================
CREATE TABLE chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id      UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    qdrant_point_id UUID NOT NULL,
    chunk_index     INTEGER NOT NULL,
    total_chunks    INTEGER NOT NULL,
    chapter_title   TEXT,
    text            TEXT NOT NULL,
    token_count     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chunks_point_unique UNIQUE (qdrant_point_id),
    CONSTRAINT chunks_edition_index_unique UNIQUE (edition_id, chunk_index)
);

CREATE INDEX chunks_edition_idx ON chunks (edition_id);
