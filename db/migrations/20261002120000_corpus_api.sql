-- migrate:up
-- =============================================================================
-- Préparation de la Corpus API (voir docs/corpus-api.md, §9)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plus de comptes utilisateurs dans le corpus
-- -----------------------------------------------------------------------------
-- L'identité est gérée par Keycloak. Le corpus ne garde que le `sub` OIDC de
-- la personne qui a posé un lien ou rendu un verdict (texte opaque, sans clé
-- étrangère : le compte peut disparaître, la trace reste).
ALTER TABLE segment_alignments DROP COLUMN created_by;
ALTER TABLE segment_alignments ADD COLUMN created_by_sub TEXT;

ALTER TABLE alignment_reviews DROP COLUMN reviewer_id;
ALTER TABLE alignment_reviews ADD COLUMN reviewer_sub TEXT;
CREATE INDEX alignment_reviews_reviewer_idx ON alignment_reviews (reviewer_sub);

DROP TABLE users;

-- -----------------------------------------------------------------------------
-- 2. Droits d'accès au texte d'une édition
-- -----------------------------------------------------------------------------
-- open       = domaine public ou licence libre : texte intégral et EPUB servis
-- excerpt    = sous droits : extraits courts dans les résultats de recherche
-- restricted = métadonnées seulement (défaut : rien n'est publié par erreur)
-- Renseigné depuis work.toml (`access = "open"` dans [[editions]]).
CREATE TYPE edition_access AS ENUM ('open', 'excerpt', 'restricted');

ALTER TABLE editions ADD COLUMN access edition_access NOT NULL DEFAULT 'restricted';

-- -----------------------------------------------------------------------------
-- 3. Révision du texte d'une édition
-- -----------------------------------------------------------------------------
-- Incrémentée par l'ingestion à chaque remplacement du texte (les segments
-- sont alors recréés et leurs `seq` peuvent changer). Les applications
-- désignent une position par (edition_id, revision, seq) et la recalent
-- quand la révision change.
ALTER TABLE editions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE editions ADD CONSTRAINT editions_revision_positive CHECK (revision > 0);

-- -----------------------------------------------------------------------------
-- 4. Journal des changements du corpus (flux /v1/changes)
-- -----------------------------------------------------------------------------
-- Écrit par l'ingestion dans la même transaction que la modification, via
-- `corpus_emit` (jamais par INSERT direct) : le verrou garantit que les `id`
-- deviennent visibles dans l'ordre croissant, donc un lecteur qui reprend
-- « après l'id N » ne saute aucun événement.
-- Pas de clé étrangère : l'événement survit à la suppression de l'objet.
CREATE TABLE corpus_events (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    type        TEXT NOT NULL,
    work_id     UUID,
    edition_id  UUID,
    data        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX corpus_events_work_idx ON corpus_events (work_id);
CREATE INDEX corpus_events_edition_idx ON corpus_events (edition_id);

CREATE FUNCTION corpus_emit(p_type TEXT, p_work_id UUID, p_edition_id UUID, p_data JSONB DEFAULT '{}')
RETURNS BIGINT AS $$
DECLARE
    event_id BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('corpus_events'));
    INSERT INTO corpus_events (type, work_id, edition_id, data)
    VALUES (p_type, p_work_id, p_edition_id, coalesce(p_data, '{}'))
    RETURNING id INTO event_id;
    PERFORM pg_notify('corpus_events', event_id::TEXT);
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 5. Plage de segments de chaque section d'une édition (table des matières)
-- -----------------------------------------------------------------------------
-- seq_start / seq_end couvrent la section ET ses descendantes ; NULL pour une
-- section sans aucun segment. Fonction (et non vue) pour que le filtre sur
-- l'édition s'applique avant la récursion.
CREATE FUNCTION section_ranges(p_edition_id UUID)
RETURNS TABLE (section_id UUID, seq_start INTEGER, seq_end INTEGER, n_segments BIGINT) AS $$
    WITH RECURSIVE sub AS (
        SELECT id AS section_id, id AS descendant_id
        FROM sections WHERE edition_id = p_edition_id
        UNION ALL
        SELECT sub.section_id, s.id
        FROM sub JOIN sections s ON s.parent_id = sub.descendant_id
    )
    SELECT sec.id, min(sg.seq), max(sg.seq), count(sg.seq)
    FROM sections sec
    LEFT JOIN sub ON sub.section_id = sec.id
    LEFT JOIN segments sg ON sg.section_id = sub.descendant_id AND sg.edition_id = p_edition_id
    WHERE sec.edition_id = p_edition_id
    GROUP BY sec.id;
$$ LANGUAGE sql STABLE;

-- -----------------------------------------------------------------------------
-- 6. Recherche approchée sur les titres et les noms (autocomplétion)
-- -----------------------------------------------------------------------------
-- unaccent() n'est pas IMMUTABLE (il dépend d'un dictionnaire modifiable) :
-- l'enveloppe ci-dessous fige le dictionnaire pour pouvoir l'indexer.
-- Noms qualifiés par `public.` : Postgres 17 évalue les expressions d'index
-- avec un search_path réduit à pg_catalog.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE FUNCTION immutable_unaccent(TEXT) RETURNS TEXT AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Forme normalisée pour comparer : minuscules, sans accents.
CREATE FUNCTION search_key(TEXT) RETURNS TEXT AS $$
    SELECT lower(public.immutable_unaccent($1));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX works_title_trgm_idx
    ON works USING gin (search_key(title) public.gin_trgm_ops);
CREATE INDEX work_titles_title_trgm_idx
    ON work_titles USING gin (search_key(title) public.gin_trgm_ops);
CREATE INDEX persons_display_name_trgm_idx
    ON persons USING gin (search_key(display_name) public.gin_trgm_ops);
CREATE INDEX person_names_name_trgm_idx
    ON person_names USING gin (search_key(name) public.gin_trgm_ops);

-- migrate:down
DROP INDEX person_names_name_trgm_idx;
DROP INDEX persons_display_name_trgm_idx;
DROP INDEX work_titles_title_trgm_idx;
DROP INDEX works_title_trgm_idx;
DROP FUNCTION search_key(TEXT);
DROP FUNCTION immutable_unaccent(TEXT);
DROP FUNCTION section_ranges(UUID);
DROP FUNCTION corpus_emit(TEXT, UUID, UUID, JSONB);
DROP TABLE corpus_events;
ALTER TABLE editions DROP COLUMN revision;
ALTER TABLE editions DROP COLUMN access;
DROP TYPE edition_access;

-- Les comptes reviennent vides : les `sub` Keycloak ne correspondent à aucun
-- utilisateur local.
CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    avatar_object_key    TEXT,
    preferred_languages  TEXT[] NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email)
);
DROP INDEX alignment_reviews_reviewer_idx;
ALTER TABLE alignment_reviews DROP COLUMN reviewer_sub;
ALTER TABLE alignment_reviews ADD COLUMN reviewer_id UUID REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX alignment_reviews_reviewer_idx ON alignment_reviews (reviewer_id);
ALTER TABLE segment_alignments DROP COLUMN created_by_sub;
ALTER TABLE segment_alignments ADD COLUMN created_by UUID REFERENCES users (id) ON DELETE SET NULL;
