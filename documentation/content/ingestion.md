---
title: Ingestion
group: traitements
summary: Le pipeline check → extract → index → align, de l'EPUB au texte canonique, aux vecteurs Qdrant et aux alignements.
links: [donnees, recherche, alignement, worker, console, developpement]
---

# Ingestion

Le pipeline (`ingest/`, Python, CLI `thot`) transforme des EPUB en corpus.
Il se déroule en étapes **indépendantes, relançables sans doublon**, qui
reprennent là où elles s'étaient arrêtées.

```mermaid
flowchart LR
  src[("books/<br/>ou dépôt inbox/")] --> check["check<br/>valide, lit, détecte la langue"]
  check --> extract["extract<br/>EPUB → Postgres<br/>CPU, parallèle"]
  extract --> quality["quality<br/>signaux par édition"]
  quality --> index["index<br/>Postgres → Qdrant<br/>GPU Qwen3 + BM25 CPU"]
  index --> align["align<br/>Postgres → Postgres<br/>GPU LaBSE"]
  extract -. "EPUB" .-> minio[("MinIO books")]
  index -. "points" .-> qdrant[("Qdrant")]
```

| Étape | Granularité | Matériel | Écrit |
| --- | --- | --- | --- |
| `extract` | 1× par livre | CPU, parallèle (`--workers N`) | œuvres, éditions, sections, segments, notes, pages ; EPUB dans MinIO |
| `quality` | 1× par édition | CPU | `edition_quality` |
| `index` | 1× par livre **et par modèle** | GPU (dense) + CPU (BM25) | `chunks`, points Qdrant, `edition_indexings` |
| `align` | 1× par **œuvre** (≥ 2 éditions) | GPU (LaBSE) | `work_units`, `segment_alignments`, `edition_alignments` |

## Ranger les livres

Deux voies d'entrée : le dossier `books/` (import en lot) ou le **dépôt**
depuis la [console](#console) (classement automatique).

```
books/
└── dostoievski-fiodor/
    └── crime-et-chatiment/
        ├── work.toml
        ├── ru.epub                  ← original
        ├── fr--markowicz.epub       ← <langue>--<traducteur>.epub
        └── en--garnett.epub
```

La fiche `work.toml` décrit l'œuvre (titre original, langue, année, auteurs,
courants, QID Wikidata) et chaque édition (fichier, langue, traducteurs,
éditeur, droits `access`). Depuis la console, **Postgres est la référence** :
`thot extract` crée ce qui manque mais ne réécrit plus une fiche existante
(`--overwrite-metadata` pour forcer).

## Extraction

```mermaid
flowchart TB
  epub["EPUB"] --> drm{"DRM ?"}
  drm -- "oui" --> refuse["refusé"]
  drm -- "non" --> opf["OPF : spine = ordre de lecture"]
  opf --> toc["Structure : nav / NCX<br/>sinon titres h1–h6"]
  toc --> kinds["Types et numéros de sections<br/>multilingues : Chapitre III, ЧАСТЬ ПЕРВАЯ…"]
  kinds --> matter["front / body / back<br/>landmarks, epub:type, position"]
  matter --> blocks["Blocs → segments typés<br/>prose, vers, réplique, didascalie…"]
  blocks --> notes["Notes sorties du fil<br/>reliées à leur appel, auteur deviné"]
  notes --> pages["Pagination papier (pagebreak)<br/>markup : italique, gras, exposants"]
  pages --> tx[("Une transaction Postgres<br/>+ corpus_emit()")]
```

- La licence Project Gutenberg est retirée ; les tables des matières
  aplaties de Gutenberg sont ré-imbriquées.
- « N.d.T. » → note du traducteur.
- Un texte **remplacé** (nouvel EPUB d'une édition existante) incrémente
  `editions.revision` et émet `edition.text_replaced` (voir
  [Révisions et ancres](#revisions)).
- Seul le **corps** (`matter = body`) est ensuite vectorisé.

## Découpage et indexation

Le découpeur `v1` produit des **fenêtres de segments entiers** :

| Paramètre | Valeur |
| --- | --- |
| cible | ~400 tokens |
| maximum | 512 tokens (un segment plus long reste seul) |
| chevauchement | ~60 tokens (derniers segments du chunk précédent) |
| minimum | 100 tokens (un dernier chunk trop petit est fusionné) |

Un chunk ne déborde jamais de sa section et n'inclut jamais de note.

Chaque chunk devient un point Qdrant avec deux vecteurs nommés :

- `dense` — **Qwen3-Embedding-0.6B** (1024 dimensions, cosinus), sur GPU ;
- `bm25` — vecteur creux calculé sur CPU (racinisation Snowball selon la
  langue, hachage 32 bits), l'IDF étant calculé par Qdrant.

Le payload porte de quoi filtrer sans retourner à Postgres : `work_id`,
`edition_id`, `language`, `is_original`, `access`, `author_ids`,
`movement_ids`, `first_published_year`, `section_kind`…

## Changer de modèle d'embedding

```mermaid
stateDiagram-v2
  [*] --> building: thot index create
  building --> building: thot index run (backfill par édition)
  building --> active: thot index activate (bascule de l'alias chunks)
  active --> retired: un autre index est activé
  retired --> [*]
```

L'ancien index reste interrogeable jusqu'à la bascule, et un seul index est
`active` à la fois (changement fait dans une même transaction). L'API
détecte la bascule et recharge l'encodeur d'elle-même (vérification toutes
les 30 s).

## Commandes

```bash
thot check [--dump DIR]          # valide books/, --dump écrit le texte extrait
thot extract [--workers N]       # EPUB → Postgres (+ MinIO)
thot index create                # nouvel index (EMBEDDING_MODEL, découpage v1)
thot index run <collection>      # vectorise les éditions pas encore indexées
thot index activate <collection> # bascule l'alias de recherche
thot index sync-payload          # recopie les champs modifiables dans Qdrant
thot align [--work auteur/oeuvre]
thot quality
thot worker                      # exécute la file de tâches
thot status
thot search "un meurtre" --mode theme|quote|words --lang fr --show en
```

Les exécutions de la CLI créent aussi une ligne `jobs` (`kind = cli`) : elles
apparaissent dans la console comme celles du worker.
