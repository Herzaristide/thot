-- migrate:up
-- =============================================================================
-- Utilisateurs
-- -----------------------------------------------------------------------------
-- avatar_object_key = clé de l'objet photo de profil dans le bucket MinIO.
-- preferred_languages = langues d'affichage des passages, par ordre de
-- préférence (codes BCP 47, ex: {fr,en}).
-- =============================================================================
CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    avatar_object_key    TEXT,
    preferred_languages  TEXT[] NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email)
);

-- migrate:down
-- Schéma initial : pas de retour arrière (repartir d'une base vide).
