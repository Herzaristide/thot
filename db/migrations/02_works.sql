-- migrate:up
-- =============================================================================
-- Œuvres (works)
-- -----------------------------------------------------------------------------
-- Une œuvre est indépendante de la langue : "Le Petit Prince" est une seule
-- œuvre, quelle que soit la traduction lue. Chaque version linguistique /
-- édition concrète (fichier, langue, éditeur...) est stockée dans `editions`
-- et référence son œuvre via `work_id`.
-- C'est l'unité de résultat de la recherche : les passages trouvés dans
-- plusieurs traductions d'une même œuvre sont regroupés par `work_id`.
--
-- first_published_year = date de première publication de l'œuvre (tri
-- chronologique), à ne pas confondre avec `editions.year` (date de
-- l'édition). Négatif autorisé pour l'Antiquité.
-- slug = chemin du dossier de l'œuvre dans books/ ("dostoievski-fiodor/
-- crime-et-chatiment") : identité stable utilisée par l'ingestion pour
-- retrouver l'œuvre à chaque exécution.
-- =============================================================================
CREATE TABLE works (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                  TEXT,
    title                 TEXT NOT NULL,
    original_language     TEXT,
    first_published_year  INTEGER,
    wikidata_id           TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT works_slug_unique UNIQUE (slug),
    CONSTRAINT works_wikidata_unique UNIQUE (wikidata_id),
    CONSTRAINT works_wikidata_format CHECK (wikidata_id ~ '^Q[0-9]+$'),
    CONSTRAINT works_original_language_bcp47
        CHECK (original_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);

CREATE INDEX works_title_idx ON works (title);
CREATE INDEX works_first_published_year_idx ON works (first_published_year);

CREATE TRIGGER works_set_updated_at
    BEFORE UPDATE ON works
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Titres de l'œuvre par langue ("Crime et Châtiment", "Crime and Punishment",
-- "Преступление и наказание"...)
-- -----------------------------------------------------------------------------
CREATE TABLE work_titles (
    work_id   UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    language  TEXT NOT NULL,
    title     TEXT NOT NULL,
    PRIMARY KEY (work_id, language, title)
);

CREATE INDEX work_titles_title_idx ON work_titles (title);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
