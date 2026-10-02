-- migrate:up
-- =============================================================================
-- Alignement des traductions d'une même œuvre (par pivot)
-- -----------------------------------------------------------------------------
-- Une `work_unit` est une unité de sens au niveau de l'œuvre, indépendante de
-- la langue. Chaque segment de chaque édition est rattaché à une ou plusieurs
-- unités : passer d'un passage FR au passage EN correspondant =
--   segments FR -> work_units -> segments de l'édition EN.
-- Le pivot évite d'aligner les éditions deux à deux (coût linéaire et non
-- quadratique en nombre de langues).
-- En pratique, une édition de référence (l'originale de préférence) définit
-- les unités (une unité par segment) ; chaque autre édition est alignée sur
-- elle, chapitre par chapitre (voir `edition_alignments`).
-- Les relations sont n-n : un paragraphe original peut être scindé en deux
-- dans une traduction, ou deux paragraphes fusionnés.
-- score / method = confiance et outil de l'aligneur (bertalign, vecalign...)
-- ou 'manual' pour un lien posé/corrigé par un humain (auteur dans
-- `created_by`, ajouté par 12_alignment_reviews.sql).
-- Invariant non garanti par les contraintes : l'édition du segment doit
-- appartenir à l'œuvre de l'unité (à vérifier par le pipeline).
-- =============================================================================
CREATE TABLE work_units (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id  UUID NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    seq      INTEGER NOT NULL,
    CONSTRAINT work_units_work_seq_unique UNIQUE (work_id, seq)
);

CREATE TABLE segment_alignments (
    segment_id  UUID NOT NULL REFERENCES segments (id) ON DELETE CASCADE,
    unit_id     UUID NOT NULL REFERENCES work_units (id) ON DELETE CASCADE,
    score       REAL,
    method      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (segment_id, unit_id),
    CONSTRAINT segment_alignments_manual_no_score
        CHECK (method <> 'manual' OR score IS NULL)
);

CREATE INDEX segment_alignments_unit_idx ON segment_alignments (unit_id);

-- -----------------------------------------------------------------------------
-- Qualité de l'alignement d'une édition sur l'édition de référence
-- -----------------------------------------------------------------------------
-- Calculée après chaque alignement. Sert à écarter les éditions dont
-- l'alignement est globalement mauvais (traduction abrégée, autre texte
-- source...) avant une analyse à grande échelle. La qualité d'une paire
-- FR <-> EN passant par le pivot est bornée par celle des deux éditions.
-- reference_edition_id NULL = cette édition EST la référence (elle définit
-- les unités).
-- aligned_ratio = part des segments de l'édition rattachés à une unité.
-- status : 'reliable' / 'doubtful' posés par seuils automatiques,
-- 'rejected' = écartée après vérification humaine.
-- -----------------------------------------------------------------------------
CREATE TYPE alignment_quality AS ENUM ('pending', 'reliable', 'doubtful', 'rejected');

CREATE TABLE edition_alignments (
    edition_id            UUID PRIMARY KEY REFERENCES editions (id) ON DELETE CASCADE,
    reference_edition_id  UUID REFERENCES editions (id) ON DELETE CASCADE,
    method                TEXT NOT NULL,
    n_segments            INTEGER NOT NULL,
    n_aligned_segments    INTEGER NOT NULL,
    aligned_ratio         REAL GENERATED ALWAYS AS (
                              n_aligned_segments::REAL / NULLIF(n_segments, 0)
                          ) STORED,
    mean_score            REAL,
    low_score_ratio       REAL,
    status                alignment_quality NOT NULL DEFAULT 'pending',
    aligned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT edition_alignments_not_self CHECK (reference_edition_id <> edition_id),
    CONSTRAINT edition_alignments_counts
        CHECK (n_aligned_segments BETWEEN 0 AND n_segments)
);

CREATE INDEX edition_alignments_reference_idx ON edition_alignments (reference_edition_id);
CREATE INDEX edition_alignments_status_idx ON edition_alignments (status);

CREATE TRIGGER edition_alignments_set_updated_at
    BEFORE UPDATE ON edition_alignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
