-- migrate:up
-- =============================================================================
-- Éditions (versions concrètes d'une œuvre)
-- -----------------------------------------------------------------------------
-- Une édition = un fichier ingéré précis : une langue, une traduction, un
-- éditeur donnés. Plusieurs éditions peuvent pointer vers la même œuvre
-- (`work_id`), typiquement une par langue/traduction disponible.
-- is_original = texte dans la langue d'origine (pas une traduction).
-- year = date de cette édition (la date de l'œuvre est
-- `works.first_published_year`).
-- sha256 = empreinte du fichier source (ré-ingérer un fichier inchangé ne
-- refait rien).
-- epub_object_key = clé de l'objet EPUB dans le bucket MinIO (stockage brut
-- du fichier, distinct du texte extrait dans `segments`).
-- source_file = chemin relatif dans books/ ("dostoievski-fiodor/crime-et-
-- chatiment/fr--markowicz.epub") : identité de l'édition pour l'ingestion.
-- Remplacer le fichier (nouveau sha256) remplace le texte de la même édition.
-- =============================================================================
CREATE TABLE editions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id          UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    sha256           CHAR(64) NOT NULL,
    title            TEXT NOT NULL,
    language         TEXT NOT NULL,
    is_original      BOOLEAN NOT NULL DEFAULT false,
    publisher        TEXT,
    year             INTEGER,
    n_pages          INTEGER,
    source_file      TEXT NOT NULL,
    epub_object_key  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT editions_sha256_unique UNIQUE (sha256),
    CONSTRAINT editions_source_file_unique UNIQUE (source_file),
    CONSTRAINT editions_epub_object_key_unique UNIQUE (epub_object_key),
    CONSTRAINT editions_language_bcp47
        CHECK (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);

CREATE INDEX editions_work_idx ON editions (work_id);
CREATE INDEX editions_title_idx ON editions (title);
CREATE INDEX editions_work_language_idx ON editions (work_id, language);

CREATE TRIGGER editions_set_updated_at
    BEFORE UPDATE ON editions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Contributeurs d'une édition (traducteur, éditeur scientifique, préfacier...)
-- -----------------------------------------------------------------------------
-- Deux traductions françaises d'une même œuvre sont deux textes différents :
-- le traducteur fait partie de l'identité de l'édition.
-- -----------------------------------------------------------------------------
CREATE TYPE contributor_role AS ENUM ('translator', 'editor', 'preface', 'illustrator');

CREATE TABLE edition_contributors (
    edition_id  UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    person_id   UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    role        contributor_role NOT NULL,
    position    SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (edition_id, person_id, role)
);

CREATE INDEX edition_contributors_person_idx ON edition_contributors (person_id);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
