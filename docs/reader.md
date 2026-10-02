# Liseuse (reader) — plan

> **État** : plan, rien n'est encore écrit. Keycloak (realm `thot`, client
> `thot-reader`) et la base `reader` existent déjà dans le compose.

Application web de lecture du corpus Thot : PWA installable sur PC et
téléphone, lisible hors ligne, au design sobre et moderne. Elle lit le corpus
**uniquement via la Corpus API** et garde les données de ses lecteurs dans
**sa propre base** (`reader`) : préférences, progression, favoris, collections.

## 1. Architecture

```
navigateur (PWA)                         reader/ (Next.js, serveur)                 
 ├─ pages React (RSC + client)  ──────►  ├─ /api/auth/*      Better Auth ──OIDC──► Keycloak (realm thot)
 ├─ service worker (Serwist)             ├─ /api/corpus/*    proxy BFF  ──JWT───► corpus-api /v1
 └─ IndexedDB (livres hors ligne,        ├─ /api/me/*        données lecteur ───► Postgres `reader`
    file d'écritures en attente)         └─ worker changes   /v1/changes ───────► anchors:resolve
```

- **BFF** : le navigateur ne parle jamais à corpus-api ni à Keycloak
  directement (hors pages de connexion). Les jetons restent côté serveur ;
  le navigateur n'a qu'un cookie de session `httpOnly`. Pas de CORS à ouvrir
  sur l'API.
- **Jeton utilisé vers l'API** :
  - lecteur connecté → son jeton d'accès Keycloak (audience `corpus-api`,
    rôle `corpus:read` attribué par défaut), rafraîchi par Better Auth ;
  - visiteur anonyme → jeton du compte de service `thot-reader`
    (`client_credentials`, `corpus:read`), mis en cache jusqu'à expiration.
- **Identité** : la clé de toutes les données lecteur est le **`sub` Keycloak**
  (`user_sub`), pas l'identifiant interne de Better Auth : les données restent
  valables si on change de bibliothèque d'authentification.
- **Positions dans le texte** : toujours des ancres complètes
  `(edition_id, revision, seq, offset, quote)` (corpus-api §5), jamais l'UUID
  d'un segment.

## 2. Pile technique

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack, React 19, React Compiler) | demandé ; RSC pour le catalogue, client pour la liseuse |
| Langage | **TypeScript** strict | demandé |
| Styles | **Tailwind CSS v4** (config CSS `@theme`, tokens en variables CSS) | demandé ; thèmes clair / sombre / sépia par variables |
| Composants | **shadcn/ui** (Radix) + **lucide** | accessibles, copiés dans le dépôt, faciles à épurer |
| Animations | **Motion** | transitions de pages, tiroirs, `prefers-reduced-motion` respecté |
| Données serveur → client | **TanStack Query v5** (+ persistance IndexedDB) | cache, préchargement du chapitre suivant, hors ligne |
| Client API | **openapi-typescript** + **openapi-fetch**, générés depuis `/v1/openapi.json` | contrat typé, régénéré par `pnpm gen:api` |
| Authentification | **Better Auth** + plugin `genericOAuth` (aide `keycloak`) | Auth.js est en maintenance (correctifs seulement) depuis le passage à l'équipe Better Auth ; Better Auth stocke les jetons Keycloak côté serveur et les rafraîchit (`getAccessToken`) |
| Base `reader` | **Drizzle ORM** + **drizzle-kit** (migrations SQL versionnées) | typé, SQL lisible, léger |
| Validation | **Zod** | corps des `/api/me/*`, préférences |
| PWA | **Serwist** (`@serwist/turbopack`), `app/manifest.ts` | solution recommandée par la doc Next.js ; `next-pwa` est abandonné et limité à webpack |
| Hors ligne | **Dexie** (IndexedDB) | livres téléchargés, file d'écritures |
| Glisser-déposer | **dnd-kit** | ordre des collections |
| Outils | pnpm, Biome, Vitest + Testing Library, Playwright | |

Les versions exactes sont figées à l'initialisation (`pnpm create next-app`)
et au fil des mises à jour, pas dans ce document.

## 3. Pages

| Route | Contenu | Accès |
| --- | --- | --- |
| `/` | Accueil : *Continuer la lecture* (dernières progressions), favoris, collections, découvertes par courant | tous (sections perso si connecté) |
| `/explore` | Catalogue : filtres auteur, courant, langue, époque ; tri ; défilement infini (curseurs de l'API) | tous |
| `/search` | Recherche de passages : modes *thème / citation / mots*, filtres, traductions jointes (`show_languages`) | tous |
| `/works/[id]` | Fiche d'œuvre : auteurs, courants, éditions et traductions (qualité d'alignement), ♥ favori, ajout à une collection, *Lire* / *Reprendre* | tous |
| `/authors/[id]`, `/movements/[id]` | Personne, courant | tous |
| `/read/[editionId]` | Liseuse (§5) | tous (progression si connecté) |
| `/library` | En cours, terminés, favoris, collections | connecté |
| `/library/collections/[id]` | Une collection, réordonnable | connecté |
| `/settings` | Préférences d'affichage et de lecture, compte (lien vers la console compte Keycloak), données hors ligne | connecté |
| `/offline` | Page de repli du service worker | — |

Barre de commande `⌘K` / `Ctrl K` partout : `/v1/suggest` (œuvres, auteurs) +
« chercher ce passage dans le corpus ».

## 4. Design

- **Sobre et typographique** : beaucoup d'espace, une couleur d'accent, une
  police de texte à empattements pour la lecture (Literata ou Source Serif 4)
  et une sans-serif pour l'interface (Inter), via `next/font`.
- **Thèmes** : clair, sombre, sépia, et *système*. Tokens Tailwind v4 en
  variables CSS (`--background`, `--foreground`, `--muted`, `--accent`…),
  appliqués sans flash grâce à un script en tête de page.
- **Couvertures génératives** : le corpus n'a pas d'images. Couverture
  composée en CSS/SVG depuis le titre, l'auteur, la date et une teinte dérivée
  du courant, ce qui donne une bibliothèque homogène.
- **Mobile d'abord** : barre d'onglets en bas sur téléphone (Accueil,
  Explorer, Recherche, Bibliothèque), barre latérale sur grand écran.
- **Liseuse immersive** : interface masquée pendant la lecture, un toucher au
  centre l'affiche, toucher sur les bords pour tourner les pages.
- **Mouvement discret** : fondus et glissements courts (150 à 250 ms),
  transition partagée couverture → fiche, aucune animation si
  `prefers-reduced-motion`.
- **Accessibilité** : WCAG AA (contrastes vérifiés dans les trois thèmes),
  navigation clavier complète, `lang` sur le texte de chaque édition.

## 5. Liseuse

- **Chargement** : `toc?matter=body` puis le chapitre courant via
  `segments?from_seq=&to_seq=&rev=&include=notes` (réponses immuables par
  révision, donc mises en cache sans limite). Le chapitre suivant est
  préchargé.
- **Rendu** : un `<p>` par segment à partir de `markup` (HTML assaini, liste
  blanche de balises) ; dialogues (`kind = speech`) stylés ; appels de note
  → popover (bas d'écran sur mobile) ; numéros de page de l'édition papier en
  marge (option).
- **Deux modes** : *défilement* (par chapitre, virtualisé) et *pages*
  (colonnes CSS, glissement horizontal). Le mode est une préférence.
- **Réglages rapides** (tiroir « Aa ») : taille, interlignage, largeur,
  justification et césure, police, thème, appliqués en direct.
- **Navigation** : table des matières, barre de progression (`/position`),
  recherche dans le livre (`/find`), marque « reprendre ici ».
- **Traductions** : changer d'édition sans perdre sa place (`/counterpart`) ;
  lecture **parallèle** côte à côte (bureau) ou en alternance (mobile) via
  `/parallel`.
- **Progression** : ancre du premier segment visible (avec `quote` : 30 à 60
  caractères), enregistrée localement à chaque changement puis envoyée toutes
  les ~5 s et à `visibilitychange`/`pagehide` (`navigator.sendBeacon`).
- **Droits** : une édition `excerpt` n'a pas de texte intégral (`403`) : la
  fiche le dit, et la liseuse ne s'ouvre pas.

## 6. Données lecteur (base `reader`)

Schéma Drizzle (tables Better Auth à part, schéma `auth`) :

```sql
-- Préférences : JSON validé par Zod (schéma versionné), évolue sans migration
preferences (
  user_sub    text PRIMARY KEY,
  data        jsonb NOT NULL,      -- { v:1, theme, font, size, lineHeight, width, align,
                                   --   hyphens, mode:'scroll'|'paged', uiLang,
                                   --   readingLangs:[], showPageNumbers, parallel:{…} }
  updated_at  timestamptz NOT NULL
)

-- Progression : une ligne par édition lue
reading_progress (
  user_sub     text,
  edition_id   uuid,
  work_id      uuid NOT NULL,
  revision     int  NOT NULL,
  seq          int  NOT NULL,
  "offset"     int  NOT NULL DEFAULT 0,
  quote        jsonb NOT NULL,     -- { exact, prefix, suffix } (TextQuoteSelector)
  progress     real NOT NULL,      -- 0..1, pour l'affichage
  section_path text[],
  started_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,  -- horodatage client : « le plus récent gagne »
  finished_at  timestamptz,
  PRIMARY KEY (user_sub, edition_id)
)
-- index (user_sub, updated_at DESC) : « Continuer la lecture »

favorites (
  user_sub   text,
  work_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_sub, work_id)
)

collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_sub    text NOT NULL,
  name        text NOT NULL,
  description text,
  emoji       text,
  position    text NOT NULL,       -- indice fractionnaire (réordonner sans tout réécrire)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_sub, name)
)

collection_items (
  collection_id uuid REFERENCES collections ON DELETE CASCADE,
  work_id       uuid,
  position      text NOT NULL,
  note          text,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, work_id)
)

-- Aperçu des œuvres pour afficher la bibliothèque sans N appels à l'API ;
-- rafraîchi par le worker sur `work.updated`
work_cache (
  work_id    uuid PRIMARY KEY,
  data       jsonb NOT NULL,       -- titre(s), auteurs, année, courants
  fetched_at timestamptz NOT NULL
)

-- Curseur du flux /v1/changes
sync_cursors ( name text PRIMARY KEY, cursor text NOT NULL, updated_at timestamptz NOT NULL )
```

Endpoints (route handlers, JSON, session obligatoire, `user_sub` tiré de la
session, jamais du corps de la requête) :

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| GET, PUT | `/api/me/preferences` | lire / remplacer (le plus récent `updated_at` gagne) |
| GET | `/api/me/progress?limit=` | progressions récentes (accueil, bibliothèque) |
| GET, PUT, DELETE | `/api/me/progress/{editionId}` | une progression ; PUT ignoré si plus ancien que l'existant |
| GET | `/api/me/favorites` | favoris |
| PUT, DELETE | `/api/me/favorites/{workId}` | ajouter / retirer (idempotents) |
| GET, POST | `/api/me/collections` | lister / créer |
| GET, PATCH, DELETE | `/api/me/collections/{id}` | une collection (nom, description, position) |
| PUT, PATCH, DELETE | `/api/me/collections/{id}/items/{workId}` | ajouter, déplacer, retirer |

Toutes les écritures sont **idempotentes** (PUT/DELETE sur une clé
naturelle) : la file hors ligne peut les rejouer sans risque.

**Worker `changes`** (cron interne ou commande `pnpm worker`) : lit
`/v1/changes` depuis `sync_cursors` ; sur `edition.text_replaced`, recale
toutes les progressions de l'édition via `anchors:resolve` (lot de 500) ;
sur `work.updated`, rafraîchit `work_cache`.

## 7. PWA et hors ligne

- **Manifeste** (`app/manifest.ts`) : nom, icônes (dont *maskable*),
  `display: standalone`, `theme_color` selon le thème, raccourci
  *Continuer la lecture*. Invite d'installation discrète (après 2 visites),
  aide spécifique pour iOS (« Ajouter à l'écran d'accueil »).
- **Service worker** (Serwist) :
  - précache de l'enveloppe de l'application et de la page `/offline` ;
  - pages : *NetworkFirst* avec repli sur le cache ;
  - `/api/corpus/*` avec `rev=` : *CacheFirst* (immuable) ; sans `rev` :
    *StaleWhileRevalidate* ;
  - polices et icônes : *CacheFirst* ;
  - écritures `/api/me/*` hors ligne : *Background Sync*, avec un vidage
    manuel de la file sur l'événement `online` (Safari n'a pas Background
    Sync).
- **Livres hors ligne** : bouton *Télécharger* sur une édition lisible :
  table des matières + tous les segments dans IndexedDB (clé
  `edition_id:revision`), gestion de l'espace dans `/settings`.
  `navigator.storage.persist()` demandé au premier téléchargement.
- **Progression hors ligne** : écrite dans IndexedDB, puis envoyée ; le
  serveur garde la plus récente (`updated_at`), ce qui règle la lecture sur
  plusieurs appareils.
- **Mise à jour** : bandeau « Nouvelle version disponible — recharger »
  (`skipWaiting` à la demande, jamais forcé en pleine lecture).

## 8. Authentification

- Better Auth + `genericOAuth` / `keycloak({ issuer, clientId: "thot-reader",
  clientSecret })`, PKCE ; discovery par le réseau interne en conteneur
  (`http://keycloak:8080/realms/thot`), émetteur public
  `http://localhost:8080/realms/thot`.
- Session en base `reader` (schéma `auth`) ; plugin `customSession` pour
  exposer `user_sub` et les rôles.
- `proxy.ts` (ex-`middleware.ts` dans Next 16) : redirige vers la connexion
  pour `/library` et `/settings`.
- Déconnexion : session locale + *RP-initiated logout* Keycloak
  (`end_session_endpoint`, `post_logout_redirect_uri`).
- Inscription, mot de passe oublié, compte : pages Keycloak. Thème Keycloak
  aux couleurs de la liseuse avec **Keycloakify** (phase 7).

## 9. Arborescence

```
reader/
├── app/
│   ├── (app)/            # barre de navigation : accueil, explore, search, works, library, settings
│   ├── read/[editionId]/ # liseuse, sans chrome
│   ├── api/auth/[...all]/route.ts
│   ├── api/corpus/[...path]/route.ts   # proxy GET en liste blanche
│   ├── api/me/…                        # données lecteur
│   ├── manifest.ts
│   └── sw.ts                           # service worker Serwist
├── components/  (ui/ = shadcn, reader/, library/, covers/)
├── lib/
│   ├── api/       # client openapi-fetch + types générés (schema.d.ts)
│   ├── auth.ts    # Better Auth (serveur), auth-client.ts
│   ├── db/        # Drizzle : schema.ts, client
│   ├── offline/   # Dexie, file d'écritures
│   └── prefs/     # schéma Zod des préférences
├── drizzle/       # migrations générées
├── worker/        # synchronisation /v1/changes
├── tests/ e2e/
└── Dockerfile     # sortie `standalone`
```

Compose : service `reader` (profil `reader`, port `${READER_PORT:-3000}`),
dépend de `keycloak` (sain) et de `api`. Migrations Drizzle appliquées au
démarrage du conteneur.

## 10. Étapes

| # | Étape | Livrable vérifiable |
| --- | --- | --- |
| 0 | **Socle** : `reader/` (Next 16, TS strict, Tailwind v4, shadcn, Biome, Vitest), `pnpm gen:api`, Drizzle + première migration, Dockerfile, service compose, ajout au `flake.nix` (node, pnpm) | `pnpm build` et `docker compose --profile reader up` répondent |
| 1 | **Auth et proxy** : Better Auth + Keycloak, jeton de service pour les anonymes, `/api/corpus/*`, routes protégées | connexion / déconnexion avec `lecteur` ; fiche d'une œuvre servie via le proxy |
| 2 | **Catalogue** : accueil, explore, fiche d'œuvre, auteur, courant, couvertures génératives, `⌘K` | navigation complète sur les 36 éditions |
| 3 | **Liseuse** : toc, chapitres, notes, modes défilement / pages, réglages « Aa » (locaux) | lire un livre de bout en bout, mobile et bureau |
| 4 | **Données lecteur** : préférences, progression (ancres), favoris, collections (CRUD, glisser-déposer) | reprise de lecture sur un 2ᵉ appareil |
| 5 | **PWA et hors ligne** : manifeste, Serwist, téléchargement d'un livre, file d'écritures | installation, puis lecture et progression en mode avion, synchronisées au retour |
| 6 | **Multilingue** : changement de traduction, lecture parallèle, recherche de passages, recherche dans le livre | notes-from-underground côte à côte |
| 7 | **Finitions** : worker `/v1/changes`, thème Keycloakify, E2E Playwright, audit Lighthouse (PWA, a11y ≥ 95) | rapport Lighthouse, tests verts |

## 11. Points à trancher

- **Lecture anonyme** : le plan permet de parcourir le catalogue et de lire
  les éditions `open` sans compte (jeton de service). La lecture doit-elle au
  contraire exiger une connexion ?
- **Données de test** : les 36 éditions sont `restricted`, donc invisibles
  pour un lecteur normal. Il faudra passer quelques éditions du domaine public
  en `access = "open"` dans leurs `work.toml`. En attendant, l'utilisateur de
  développement `lecteur` a `corpus:admin`.
- **API** : un `GET /v1/works?ids=…` (lot) éviterait le cache `work_cache`
  pour la bibliothèque. À ajouter si le cache devient pénible.
- **Annotations** (surlignages, notes personnelles, signets multiples) : hors
  du périmètre demandé ; le modèle d'ancres les permet sans changer le schéma
  existant (table `annotations` à part).
