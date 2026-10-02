-- migrate:up
-- =============================================================================
-- Texte canonique d'une édition : structure (sections) et contenu (segments)
-- -----------------------------------------------------------------------------
-- `sections` = arbre de la structure du livre (tome > partie > livre >
-- chapitre, acte > scène, recueil > poème...), via `parent_id`.
-- `segments` = source de vérité du texte : paragraphes ordonnés, SANS
-- chevauchement. Le livre complet se reconstruit en concaténant les segments
-- par `seq` (vue `edition_texts`) ; les titres de sections y figurent sous
-- forme de segments 'heading'.
-- Un paragraphe trop long pour tenir dans un chunk est découpé en plusieurs
-- segments à l'ingestion : un chunk couvre donc toujours des segments entiers.
-- char_start / char_end = position dans le texte reconstruit (segments joints
-- par '\n\n'), pour surligner un passage ou une citation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sections
-- -----------------------------------------------------------------------------
-- seq = ordre de lecture de la section dans l'édition (parcours en
-- profondeur : une partie précède ses chapitres).
-- label = étiquette numérotée telle qu'imprimée ("Chapitre III", "Livre
-- premier", "Acte II") ; title = titre propre ("La rencontre"). L'un, l'autre
-- ou les deux peuvent manquer.
-- number = numéro parmi les sections sœurs, quand il est déterminable
-- (sert à faire correspondre les chapitres entre traductions).
-- matter = préliminaires (préface, dédicace...) / corps / annexes (notes,
-- postface...). Seul le corps est indexé par défaut.
-- source_href = position dans l'EPUB ("text/ch03.xhtml#sec2"), pour le debug
-- et la ré-extraction.
-- reference_section_id = section correspondante dans l'édition de référence
-- de l'œuvre (alignement au niveau chapitre, repli quand l'alignement des
-- paragraphes est douteux).
-- -----------------------------------------------------------------------------
CREATE TYPE section_kind AS ENUM (
    -- grandes divisions
    'volume', 'part', 'book', 'chapter', 'section',
    -- théâtre
    'act', 'scene',
    -- recueils
    'poem', 'canto', 'story', 'letter', 'essay',
    -- péritexte
    'dedication', 'epigraph', 'preface', 'foreword', 'introduction',
    'prologue', 'epilogue', 'afterword', 'appendix', 'glossary',
    'notes', 'note',
    'other'
);

CREATE TYPE book_matter AS ENUM ('front', 'body', 'back');

CREATE TABLE sections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id            UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    parent_id             UUID REFERENCES sections (id) ON DELETE CASCADE,
    seq                   INTEGER NOT NULL,
    kind                  section_kind NOT NULL DEFAULT 'other',
    matter                book_matter NOT NULL DEFAULT 'body',
    label                 TEXT,
    title                 TEXT,
    number                INTEGER,
    source_href           TEXT,
    reference_section_id  UUID REFERENCES sections (id) ON DELETE SET NULL,
    CONSTRAINT sections_edition_seq_unique UNIQUE (edition_id, seq),
    CONSTRAINT sections_not_own_parent CHECK (parent_id <> id)
);

CREATE INDEX sections_parent_idx ON sections (parent_id);
CREATE INDEX sections_reference_idx ON sections (reference_section_id);

-- -----------------------------------------------------------------------------
-- Segments
-- -----------------------------------------------------------------------------
-- section_id = section la plus profonde qui contient le segment.
-- kind = nature du bloc :
--   heading         titre de section (repris de sections.label/title)
--   paragraph       prose
--   verse           strophe ou groupe de vers (sauts de ligne conservés)
--   speech          réplique de théâtre, `speaker` = personnage
--   stage_direction didascalie
--   epigraph        épigraphe
--   quote           citation en bloc, lettre insérée...
--   note            contenu d'une note (dans une section 'note', voir
--                   `note_refs`)
-- text = texte brut (recherche, chunking, alignement).
-- markup = même texte avec le balisage en ligne minimal pour l'affichage
-- (<em>, <strong>, <sup>, <sub>, <span class="smallcaps">, <br/>) ; NULL si
-- le segment n'a aucune mise en forme.
-- -----------------------------------------------------------------------------
CREATE TYPE segment_kind AS ENUM (
    'heading', 'paragraph', 'verse', 'speech', 'stage_direction',
    'epigraph', 'quote', 'note', 'other'
);

CREATE TABLE segments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id  UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    section_id  UUID REFERENCES sections (id) ON DELETE SET NULL,
    seq         INTEGER NOT NULL,
    kind        segment_kind NOT NULL DEFAULT 'paragraph',
    speaker     TEXT,
    char_start  INTEGER NOT NULL,
    char_end    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    markup      TEXT,
    CONSTRAINT segments_edition_seq_unique UNIQUE (edition_id, seq),
    CONSTRAINT segments_char_range CHECK (char_start >= 0 AND char_end > char_start),
    CONSTRAINT segments_speaker_only_speech CHECK (speaker IS NULL OR kind = 'speech')
);

CREATE INDEX segments_section_idx ON segments (section_id);

-- -----------------------------------------------------------------------------
-- Appels de note
-- -----------------------------------------------------------------------------
-- Les notes sont sorties du fil du texte (sinon elles coupent les phrases)
-- mais conservées : chaque note est une section 'note' (rangée sous une
-- section 'notes', en annexe) dont les paragraphes sont des segments 'note'.
-- Un appel relie la position de l'appel dans le texte à cette section.
-- origin = auteur de la note : les notes du traducteur ou de l'éditeur
-- n'existent pas dans l'original (à ignorer pour l'alignement).
-- -----------------------------------------------------------------------------
CREATE TYPE note_origin AS ENUM ('author', 'translator', 'editor', 'unknown');

CREATE TABLE note_refs (
    segment_id       UUID NOT NULL REFERENCES segments (id) ON DELETE CASCADE,
    char_offset      INTEGER NOT NULL,
    label            TEXT NOT NULL,
    note_section_id  UUID NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
    origin           note_origin NOT NULL DEFAULT 'unknown',
    PRIMARY KEY (segment_id, char_offset),
    CONSTRAINT note_refs_offset_positive CHECK (char_offset >= 0)
);

CREATE INDEX note_refs_note_section_idx ON note_refs (note_section_id);

-- -----------------------------------------------------------------------------
-- Pagination de l'édition papier
-- -----------------------------------------------------------------------------
-- Marqueurs `epub:type="pagebreak"` de l'EPUB, quand il en contient : début
-- de la page `label` au caractère `char_offset` du texte reconstruit (même
-- repère que segments.char_start). Permet de citer "édition X, p. Y".
-- label est du texte : pages en chiffres romains (préface), "12a"...
-- -----------------------------------------------------------------------------
CREATE TABLE page_breaks (
    edition_id   UUID NOT NULL REFERENCES editions (id) ON DELETE CASCADE,
    char_offset  INTEGER NOT NULL,
    label        TEXT NOT NULL,
    PRIMARY KEY (edition_id, char_offset),
    CONSTRAINT page_breaks_offset_positive CHECK (char_offset >= 0)
);

-- -----------------------------------------------------------------------------
-- Texte intégral d'une édition (titres compris, dans l'ordre de lecture)
-- -----------------------------------------------------------------------------
CREATE VIEW edition_texts AS
SELECT edition_id,
       string_agg(text, E'\n\n' ORDER BY seq) AS text
FROM segments
GROUP BY edition_id;

-- -----------------------------------------------------------------------------
-- Chemin de chaque section dans l'arbre ("Première partie > Chapitre III")
-- -----------------------------------------------------------------------------
-- depth = 0 pour une section racine. path = étiquettes/titres des ancêtres
-- puis de la section, pour l'affichage d'un résultat de recherche et le
-- payload Qdrant.
-- -----------------------------------------------------------------------------
CREATE VIEW section_paths AS
WITH RECURSIVE tree AS (
    SELECT id, edition_id, 0 AS depth,
           ARRAY[coalesce(label, title, kind::TEXT)] AS path
    FROM sections
    WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, s.edition_id, t.depth + 1,
           t.path || coalesce(s.label, s.title, s.kind::TEXT)
    FROM sections s
    JOIN tree t ON s.parent_id = t.id
)
SELECT id AS section_id, edition_id, depth, path,
       array_to_string(path, ' > ') AS path_text
FROM tree;

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
