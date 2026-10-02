-- migrate:up
-- =============================================================================
-- Courants littéraires
-- -----------------------------------------------------------------------------
-- Taxonomie hiérarchique (ex: romantisme > romantisme noir) via `parent_id`.
-- `slug` = identifiant technique stable ; les libellés affichés sont par
-- langue dans `movement_labels`.
-- =============================================================================
CREATE TABLE movements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL,
    parent_id    UUID REFERENCES movements (id) ON DELETE SET NULL,
    start_year   INTEGER,
    end_year     INTEGER,
    wikidata_id  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT movements_slug_unique UNIQUE (slug),
    CONSTRAINT movements_wikidata_unique UNIQUE (wikidata_id),
    CONSTRAINT movements_wikidata_format CHECK (wikidata_id ~ '^Q[0-9]+$'),
    CONSTRAINT movements_not_own_parent CHECK (parent_id <> id)
);

CREATE INDEX movements_parent_idx ON movements (parent_id);

CREATE TRIGGER movements_set_updated_at
    BEFORE UPDATE ON movements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE movement_labels (
    movement_id  UUID NOT NULL REFERENCES movements (id) ON DELETE CASCADE,
    language     TEXT NOT NULL,
    label        TEXT NOT NULL,
    PRIMARY KEY (movement_id, language)
);

-- -----------------------------------------------------------------------------
-- Association œuvres <-> courants (n-n)
-- -----------------------------------------------------------------------------
CREATE TABLE work_movements (
    work_id      UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    movement_id  UUID NOT NULL REFERENCES movements (id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, movement_id)
);

CREATE INDEX work_movements_movement_idx ON work_movements (movement_id);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
