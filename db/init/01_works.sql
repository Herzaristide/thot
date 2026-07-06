-- =============================================================================
-- Œuvres (works)
-- -----------------------------------------------------------------------------
-- Une œuvre est indépendante de la langue : "Le Petit Prince" est une seule
-- œuvre, quelle que soit la traduction lue. Chaque version linguistique /
-- édition concrète (fichier, langue, éditeur...) est stockée dans `editions`
-- et référence son œuvre via `work_id`.
-- =============================================================================
CREATE TABLE works (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX works_title_idx ON works (title);

CREATE TRIGGER works_set_updated_at
    BEFORE UPDATE ON works
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
