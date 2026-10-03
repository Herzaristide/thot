---
title: Liseuse
group: applications
summary: La PWA Next.js 16 de lecture — pages, rendu du texte, lecture parallèle, données lecteur, hors ligne et synchronisation.
links: [architecture, authentification, corpus-api, revisions, alignement, deploiement]
---

# Liseuse (`reader/`)

Application web de lecture : **PWA** installable sur ordinateur et
téléphone, lisible **hors ligne**. Elle lit le corpus **uniquement via la
Corpus API** et garde les données de ses lecteurs dans sa propre base
`reader`.

## Architecture

```mermaid
flowchart LR
  subgraph browser["Navigateur (PWA)"]
    ui["Pages React<br/>RSC + client"]
    sw["Service worker<br/>Serwist"]
    idb[("IndexedDB (Dexie)<br/>livres, file d'écritures")]
  end
  subgraph next["reader/ — serveur Next.js"]
    auth["/api/auth/*<br/>Better Auth"]
    proxy["/api/corpus/*<br/>proxy GET en liste blanche"]
    me["/api/me/*<br/>données lecteur"]
  end
  worker["reader-worker<br/>worker.mjs"]
  kc["Keycloak"]
  api["Corpus API"]
  db[("Postgres reader<br/>Drizzle")]

  ui --> auth & proxy & me
  ui <--> idb
  sw -. "cache" .- proxy
  auth -- "OIDC" --> kc
  proxy -- "JWT" --> api
  me --> db
  worker -- "/v1/changes, anchors:resolve" --> api
  worker --> db
```

## Pile

| Besoin | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React 19, React Compiler) |
| Styles et composants | Tailwind CSS v4, shadcn/ui (Radix), lucide, Motion |
| Données | TanStack Query v5, client `openapi-fetch` généré (`pnpm gen:api`) |
| Authentification | Better Auth + `genericOAuth` (Keycloak), jetons côté serveur |
| Base | Drizzle ORM + drizzle-kit (migrations SQL) |
| Hors ligne | Serwist (service worker), Dexie (IndexedDB) |
| Outils | pnpm, Biome, Vitest, Playwright |

## Pages

| Route | Contenu |
| --- | --- |
| `/` | continuer la lecture, favoris, collections, découvertes |
| `/explore` | catalogue filtrable, défilement infini |
| `/search` | recherche de passages (thème, citation, mots), traductions jointes |
| `/works/[id]`, `/authors/[id]`, `/movements/[id]` | fiches |
| `/read/[editionId]` | la liseuse |
| `/library`, `/library/collections/[id]` | bibliothèque personnelle (connecté) |
| `/settings` | préférences, données hors ligne |
| `/offline` | repli du service worker |

Barre de commande `⌘K` partout (`/v1/suggest`).

## Lire un chapitre

```mermaid
sequenceDiagram
  autonumber
  participant L as Liseuse (client)
  participant C as Cache (TanStack Query / SW / IndexedDB)
  participant B as BFF /api/corpus
  participant A as Corpus API
  L->>B: toc?matter=body
  B->>A: GET /v1/editions/{id}/toc
  A-->>L: arbre des sections (seq_start, seq_end)
  L->>C: segments?from_seq&to_seq&rev&include=notes
  alt en cache (immuable par révision)
    C-->>L: segments
  else
    C->>B: requête
    B->>A: GET /v1/editions/{id}/segments
    A-->>L: segments (text + markup)
  end
  L->>L: rendu (markup assaini, liste blanche)
  L-->>B: préchargement du chapitre suivant
```

- **Deux modes** : défilement par chapitre, ou pages (colonnes CSS).
- **Réglages « Aa »** : taille, interlignage, largeur, justification,
  police, thèmes clair / sombre / sépia.
- **Traductions** : changer d'édition sans perdre sa place
  (`/counterpart`), lecture **parallèle** côte à côte sur bureau, en
  alternance sur mobile (`/parallel`).

## Données lecteur

```mermaid
erDiagram
  preferences {
    text user_sub PK
    jsonb data "schéma Zod versionné"
  }
  reading_progress {
    text user_sub PK
    uuid work_id PK
    uuid edition_id
    int revision
    int seq
    int offset
    jsonb quote
    real progress
  }
  favorites {
    text user_sub PK
    uuid work_id PK
  }
  collections ||--o{ collection_items : ""
  collections {
    uuid id PK
    text user_sub
    text name
    text position "indice fractionnaire"
  }
  collection_items {
    uuid collection_id PK
    uuid work_id PK
    text position
  }
  work_cache {
    uuid work_id PK
    jsonb data
  }
  sync_cursors {
    text name PK
    text cursor
  }
```

- Clé de toutes les données : le **`sub` Keycloak**, jamais l'id interne de
  Better Auth.
- **Une progression par œuvre**, quelle que soit la traduction lue ; ouvrir
  une autre édition convertit la position par `/counterpart`.
- Écritures **idempotentes** (PUT / DELETE sur clé naturelle) : la file hors
  ligne peut les rejouer sans risque ; « le plus récent `updated_at` gagne »
  entre appareils.

## Hors ligne

```mermaid
flowchart TB
  w["Écriture (progression, favori…)"] --> local["IndexedDB<br/>file d'écritures (outbox)"]
  local --> net{"réseau ?"}
  net -- "oui" --> put["PUT /api/me/…"]
  net -- "non" --> wait["attente"]
  wait -- "online / retour sur l'onglet / démarrage" --> put
  put --> srv{"plus récent que<br/>l'existant ?"}
  srv -- "oui" --> save["enregistré"]
  srv -- "non" --> ign["ignoré"]
```

| Ressource | Stratégie du service worker |
| --- | --- |
| enveloppe de l'application, `/offline` | précache |
| pages | NetworkFirst |
| `/api/corpus/*` avec `rev=` | CacheFirst (immuable) |
| `/api/corpus/*` sans `rev` | StaleWhileRevalidate |
| polices, icônes | CacheFirst |

Un livre **téléchargé** (table des matières + tous les segments, clé
`edition_id:revision`) se lit entièrement hors ligne. Une seule file
d'écritures côté client plutôt que *Background Sync*, absent de Safari et
Firefox.
