"""Configuration lue depuis l'environnement (et le .env à la racine du dépôt)."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://thot:thot@localhost:5432/thot"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    # Alias Qdrant interrogé par la recherche ; pointe vers l'index actif.
    qdrant_collection: str = "chunks"

    books_dir: Path = REPO_ROOT / "books"

    embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
    vector_size: int = 1024
    align_model: str = "sentence-transformers/LaBSE"
    # "cuda", "cpu" ou vide = cuda si disponible.
    device: str | None = None
    embed_batch_size: int = 32

    # Stockage des EPUB (MinIO / S3). Endpoint vide = pas d'envoi.
    minio_endpoint: str | None = "http://localhost:9000"
    minio_root_user: str = "thot"
    minio_root_password: str = "change-me"
    minio_books_bucket: str = "books"

    @field_validator("books_dir")
    @classmethod
    def _relative_to_repo(cls, value: Path) -> Path:
        # "./books" dans le .env désigne le dossier à la racine du dépôt,
        # quel que soit le dossier courant.
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
