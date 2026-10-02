-- migrate:up
-- =============================================================================
-- Index vectoriels (registre des collections Qdrant)
-- -----------------------------------------------------------------------------
-- Une ligne = une collection Qdrant = un modèle dense (+ sparse) appliqué à un
-- découpage (`chunker_version`). Changer de modèle = créer un nouvel index en
-- 'building', le remplir en tâche de fond, puis basculer l'alias Qdrant
-- et passer l'index en 'active' (l'ancien en 'retired').
-- Le point Qdrant d'un chunk a toujours l'id `chunks.id`, quelle que soit la
-- collection.
-- =============================================================================
CREATE TYPE vector_index_status AS ENUM ('building', 'active', 'retired');

CREATE TABLE vector_indexes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection       TEXT NOT NULL,
    dense_model      TEXT NOT NULL,
    dense_dim        INTEGER NOT NULL,
    sparse_model     TEXT,
    chunker_version  TEXT NOT NULL,
    status           vector_index_status NOT NULL DEFAULT 'building',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vector_indexes_collection_unique UNIQUE (collection),
    CONSTRAINT vector_indexes_dense_dim_positive CHECK (dense_dim > 0)
);

-- Un seul index actif à la fois (celui vers lequel pointe l'alias Qdrant)
CREATE UNIQUE INDEX vector_indexes_one_active_idx
    ON vector_indexes (status) WHERE status = 'active';

CREATE TRIGGER vector_indexes_set_updated_at
    BEFORE UPDATE ON vector_indexes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Avancement : quelles éditions sont indexées dans quel index
-- -----------------------------------------------------------------------------
-- Le backfill d'un nouvel index traite les éditions absentes de cette table
-- pour cet index.
-- -----------------------------------------------------------------------------
CREATE TABLE edition_indexings (
    edition_id  UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    index_id    UUID NOT NULL REFERENCES vector_indexes (id) ON DELETE CASCADE,
    n_points    INTEGER NOT NULL,
    indexed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (edition_id, index_id)
);

CREATE INDEX edition_indexings_index_idx ON edition_indexings (index_id);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
