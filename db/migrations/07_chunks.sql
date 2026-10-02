-- migrate:up
-- =============================================================================
-- Chunks (miroir relationnel des points Qdrant)
-- -----------------------------------------------------------------------------
-- Un chunk = une fenêtre de segments consécutifs [segment_start_seq,
-- segment_end_seq] d'une édition ; deux chunks voisins peuvent se chevaucher.
-- `id` est aussi l'identifiant du point dans TOUTES les collections Qdrant
-- qui indexent ce chunk (une collection par modèle, voir `vector_indexes`).
-- Le texte n'est pas dupliqué ici : il se lit depuis `segments` (vue
-- `chunk_texts`).
-- chunker_version = stratégie de découpage. Plusieurs découpages d'une même
-- édition coexistent, pour qu'un ancien index reste en service pendant que le
-- nouveau (autre modèle, autre découpage) se construit.
-- Règles du chunker : un chunk ne déborde jamais de sa section, et seules les
-- sections du corps (`sections.matter = 'body'`) sont découpées ; les notes,
-- rangées en annexe dans leurs propres sections, ne se retrouvent donc
-- jamais au milieu d'un chunk.
-- =============================================================================
CREATE TABLE chunks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id         UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    chunker_version    TEXT NOT NULL,
    chunk_index        INTEGER NOT NULL,
    segment_start_seq  INTEGER NOT NULL,
    segment_end_seq    INTEGER NOT NULL,
    token_count        INTEGER,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chunks_edition_version_index_unique
        UNIQUE (edition_id, chunker_version, chunk_index),
    CONSTRAINT chunks_segment_range CHECK (segment_end_seq >= segment_start_seq),
    CONSTRAINT chunks_segment_start_fk FOREIGN KEY (edition_id, segment_start_seq)
        REFERENCES segments (edition_id, seq) ON DELETE CASCADE,
    CONSTRAINT chunks_segment_end_fk FOREIGN KEY (edition_id, segment_end_seq)
        REFERENCES segments (edition_id, seq) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Texte d'un chunk, reconstruit depuis ses segments
-- -----------------------------------------------------------------------------
CREATE VIEW chunk_texts AS
SELECT c.id AS chunk_id,
       c.edition_id,
       c.chunker_version,
       string_agg(s.text, E'\n\n' ORDER BY s.seq) AS text
FROM chunks c
JOIN segments s
  ON s.edition_id = c.edition_id
 AND s.seq BETWEEN c.segment_start_seq AND c.segment_end_seq
GROUP BY c.id, c.edition_id, c.chunker_version;

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
