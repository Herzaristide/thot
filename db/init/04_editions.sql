-- =============================================================================
-- Éditions (versions concrètes d'une œuvre)
-- -----------------------------------------------------------------------------
-- Une édition = un fichier ingéré précis : une langue, une traduction, un
-- éditeur donnés. Plusieurs éditions peuvent pointer vers la même œuvre
-- (`work_id`), typiquement une par langue/traduction disponible.
-- sha256 = empreinte du fichier source (identité stable : ré-ingérer la même
-- édition met à jour la même ligne au lieu d'en créer une nouvelle).
-- epub_object_key = clé de l'objet EPUB dans le bucket MinIO (stockage brut
-- du fichier, distinct du texte extrait/découpé en chunks).
-- =============================================================================
CREATE TABLE editions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id          UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    sha256           CHAR(64) NOT NULL,
    title            TEXT NOT NULL,
    language         TEXT,
    publisher        TEXT,
    year             INTEGER,
    n_pages          INTEGER,
    source_file      TEXT NOT NULL,
    epub_object_key  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT editions_sha256_unique UNIQUE (sha256),
    CONSTRAINT editions_epub_object_key_unique UNIQUE (epub_object_key)
);

CREATE INDEX editions_work_idx ON editions (work_id);
CREATE INDEX editions_title_idx ON editions (title);
CREATE INDEX editions_language_idx ON editions (language);

CREATE TRIGGER editions_set_updated_at
    BEFORE UPDATE ON editions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
