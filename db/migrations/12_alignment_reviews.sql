-- migrate:up
-- =============================================================================
-- Vérifications et corrections humaines des alignements
-- -----------------------------------------------------------------------------
-- Placé après `users` (11) car il y fait référence.
--
-- segment_alignments.created_by = auteur d'un lien 'manual' (correction).
--
-- alignment_reviews = verdicts humains sur des liens, pour :
--   - mesurer le taux d'erreur de l'aligneur (échantillon aléatoire vérifié
--     à la main -> "95 % des liens au-dessus de 0,8 sont justes") ;
--   - garder l'historique des corrections : un lien jugé 'incorrect' est
--     supprimé de `segment_alignments` et remplacé par un lien 'manual', mais
--     le verdict reste ici (pas de FK vers `segment_alignments`, d'où la copie
--     de method / score au moment de la vérification).
-- is_sample = verdict obtenu par tirage aléatoire (utilisable pour estimer un
-- taux d'erreur) ; false = signalement spontané d'un lecteur (biaisé, ne pas
-- l'utiliser pour les statistiques).
-- =============================================================================
ALTER TABLE segment_alignments
    ADD COLUMN created_by UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE TYPE review_verdict AS ENUM ('correct', 'incorrect', 'partial');

CREATE TABLE alignment_reviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id        UUID NOT NULL REFERENCES segments (id) ON DELETE CASCADE,
    unit_id           UUID NOT NULL REFERENCES work_units (id) ON DELETE CASCADE,
    reviewer_id       UUID REFERENCES users (id) ON DELETE SET NULL,
    verdict           review_verdict NOT NULL,
    is_sample         BOOLEAN NOT NULL DEFAULT false,
    alignment_method  TEXT NOT NULL,
    alignment_score   REAL,
    comment           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX alignment_reviews_link_idx ON alignment_reviews (segment_id, unit_id);
CREATE INDEX alignment_reviews_reviewer_idx ON alignment_reviews (reviewer_id);
CREATE INDEX alignment_reviews_sample_idx ON alignment_reviews (alignment_method)
    WHERE is_sample;

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
