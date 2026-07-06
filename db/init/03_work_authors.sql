-- =============================================================================
-- Association œuvres <-> auteurs (n-n, ordonnée)
-- -----------------------------------------------------------------------------
-- Les auteurs sont rattachés à l'œuvre (pas à une édition/traduction
-- particulière) : ils ne changent pas selon la langue lue.
-- =============================================================================
CREATE TABLE work_authors (
    work_id    UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
    position   SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (work_id, author_id)
);

CREATE INDEX work_authors_author_idx ON work_authors (author_id);
