-- migrate:up
-- =============================================================================
-- Association œuvres <-> auteurs (n-n, ordonnée)
-- -----------------------------------------------------------------------------
-- Les auteurs sont rattachés à l'œuvre (pas à une édition/traduction
-- particulière) : ils ne changent pas selon la langue lue. Les traducteurs
-- sont rattachés à l'édition (`edition_contributors`).
-- =============================================================================
CREATE TABLE work_authors (
    work_id    UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    person_id  UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    position   SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (work_id, person_id)
);

CREATE INDEX work_authors_person_idx ON work_authors (person_id);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
