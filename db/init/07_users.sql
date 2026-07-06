-- =============================================================================
-- Utilisateurs
-- -----------------------------------------------------------------------------
-- avatar_object_key = clé de l'objet photo de profil dans le bucket MinIO.
-- =============================================================================
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              TEXT NOT NULL,
    password_hash      TEXT NOT NULL,
    avatar_object_key  TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email)
);
