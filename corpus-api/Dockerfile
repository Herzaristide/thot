# Image de la Corpus API (FastAPI + encodeur de requêtes).
# Contexte de build = racine du dépôt (espace de travail uv : core + corpus-api).
# GPU conseillé pour la recherche par le sens (voir docker-compose.gpu.yml).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    HF_HOME=/cache/huggingface

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY core/pyproject.toml core/
COPY ingest/pyproject.toml ingest/
COPY corpus-api/pyproject.toml corpus-api/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package thot-api --no-install-workspace

COPY core/thot_core core/thot_core
COPY corpus-api/thot_api corpus-api/thot_api
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package thot-api

EXPOSE 8000
CMD ["uvicorn", "thot_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
