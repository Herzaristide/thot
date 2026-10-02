-- migrate:up
-- =============================================================================
-- Personnes (auteurs, traducteurs, préfaciers...)
-- -----------------------------------------------------------------------------
-- Une seule table pour toutes les personnes : le rôle dépend du lien
-- (`work_authors` pour les auteurs d'une œuvre, `edition_contributors` pour
-- les traducteurs/préfaciers d'une édition).
-- Pas d'unicité sur le nom : homonymes possibles, et un même auteur s'écrit
-- différemment selon la langue (Dostoïevski / Dostoevsky / Достоевский).
-- L'identité stable est `wikidata_id` ; les variantes vont dans `person_names`.
-- =============================================================================
CREATE TABLE persons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  TEXT NOT NULL,
    sort_name     TEXT,
    birth_year    INTEGER,
    death_year    INTEGER,
    wikidata_id   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT persons_wikidata_unique UNIQUE (wikidata_id),
    CONSTRAINT persons_wikidata_format CHECK (wikidata_id ~ '^Q[0-9]+$')
);

CREATE INDEX persons_display_name_idx ON persons (display_name);

CREATE TRIGGER persons_set_updated_at
    BEFORE UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Variantes de nom (translittérations, alias, noms de plume) par langue
-- -----------------------------------------------------------------------------
CREATE TABLE person_names (
    person_id  UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    language   TEXT NOT NULL,
    name       TEXT NOT NULL,
    PRIMARY KEY (person_id, language, name)
);

CREATE INDEX person_names_name_idx ON person_names (name);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
