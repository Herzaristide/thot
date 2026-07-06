# Thot

Deuxième version (réécriture) de `book-ingest` : bibliothèque de livres avec
recherche vectorielle et RAG.

- **PostgreSQL** — source de vérité des métadonnées (œuvres, éditions,
  auteurs, chunks, ingestions, utilisateurs).
- **Qdrant** — base vectorielle des embeddings de chunks.
- **MinIO** — stockage des fichiers EPUB et des photos de profil utilisateur.

## Démarrage

```bash
cp .env.example .env          # ajuster les mots de passe
docker compose up -d          # démarre postgres + qdrant + minio + pgadmin
```

Vérifications :

```bash
docker compose ps
curl http://localhost:6333/healthz                    # Qdrant
docker compose exec postgres pg_isready -U thot       # Postgres
curl http://localhost:9000/minio/health/live          # MinIO
```

## Schéma Postgres

Le schéma est appliqué automatiquement au **premier** démarrage du conteneur
`postgres` via les scripts de `db/init/` (dossier monté dans
`/docker-entrypoint-initdb.d`, exécutés **par ordre alphabétique** — d'où le
préfixe numérique de chaque fichier).

| Fichier | Rôle |
| --- | --- |
| `00_extensions.sql` | Extension `pgcrypto` + fonction `set_updated_at()` |
| `01_works.sql` | Œuvres : l'entité abstraite, indépendante de la langue |
| `02_authors.sql` | Auteurs (uniques par nom) |
| `03_work_authors.sql` | Association n-n œuvres ↔ auteurs |
| `04_editions.sql` | Éditions : version concrète d'une œuvre (fichier, langue, éditeur, EPUB) |
| `05_chunks.sql` | Fragments de texte d'une édition, miroir des points Qdrant (`qdrant_point_id`) |
| `06_ingestions.sql` | Suivi des exécutions du pipeline d'ingestion (par édition) |
| `07_users.sql` | Utilisateurs (email unique, mot de passe hashé, photo de profil) |

### Œuvres vs éditions

Un même livre peut exister en plusieurs langues/traductions (ex: "Le Petit
Prince" en français et en anglais). Ces versions ne doivent **pas** être des
livres distincts : elles partagent la même **œuvre** (`works`), mais chacune a
sa propre **édition** (`editions`) — son propre fichier, son propre `sha256`,
sa propre langue, son propre EPUB.

```
works (1) ──< editions (N) ──< chunks (N)
  │                              
  └──< work_authors >── authors   editions ──< ingestions
```

- `works` : titre de référence, indépendant de la langue.
- `editions.work_id` : rattache chaque version concrète à son œuvre.
- `work_authors` : les auteurs sont liés à l'œuvre (ils ne changent pas selon
  la traduction lue).
- `chunks.edition_id` / `ingestions.edition_id` : le texte et l'ingestion
  dépendent forcément d'une édition précise (le contenu change avec la langue).

> Le schéma n'est **pas** ré-appliqué si le volume `postgres_data` existe déjà.
> Pour repartir de zéro :
> ```bash
> docker compose down -v && docker compose up -d
> ```
> Pour appliquer le schéma sur une base déjà démarrée :
> ```bash
> for f in db/init/*.sql; do docker compose exec -T postgres psql -U thot -d thot < "$f"; done
> ```

## Visualiser le schéma (pgAdmin)

Un service `pgadmin` est inclus pour explorer et visualiser le schéma
(diagramme ER via l'**ERD Tool**) :

```bash
docker compose up -d pgadmin
```

Puis ouvrir http://localhost:5050 (identifiants `PGADMIN_DEFAULT_EMAIL` /
`PGADMIN_DEFAULT_PASSWORD` du `.env`). Le serveur **Thot** est préconfiguré
(host `postgres`) ; il suffit de saisir le mot de passe Postgres
(`POSTGRES_PASSWORD`) à la première connexion. Ensuite, clic droit sur la
base `thot` → **Generate ERD** pour afficher le diagramme des tables.

## Stockage de fichiers (MinIO)

Le service `minio` fournit un stockage compatible S3 pour :
- les fichiers **EPUB** des éditions (`editions.epub_object_key`) dans le
  bucket `${MINIO_BOOKS_BUCKET:-books}` ;
- les **photos de profil** utilisateur (`users.avatar_object_key`) dans le
  bucket `${MINIO_AVATARS_BUCKET:-avatars}`.

Les buckets sont créés automatiquement au démarrage par le service
`minio-init` (basé sur `mc`, s'exécute une fois puis s'arrête). Console web
sur http://localhost:9001 (identifiants `MINIO_ROOT_USER` /
`MINIO_ROOT_PASSWORD`).

## Structure

```
thot/
├── docker-compose.yml       # postgres + qdrant + minio + pgadmin
├── .env.example
├── pgadmin/
│   └── servers.json         # préconfiguration du serveur pgAdmin
└── db/
    └── init/
        ├── 00_extensions.sql
        ├── 01_works.sql
        ├── 02_authors.sql
        ├── 03_work_authors.sql
        ├── 04_editions.sql
        ├── 05_chunks.sql
        ├── 06_ingestions.sql
        └── 07_users.sql
```

