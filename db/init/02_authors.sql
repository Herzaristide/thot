-- =============================================================================
-- Auteurs
-- =============================================================================
CREATE TABLE authors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT authors_name_unique UNIQUE (name)
);
