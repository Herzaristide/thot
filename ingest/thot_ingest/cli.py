"""Ligne de commande `thot` : check, extract, index, align, status, search."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn, TimeElapsedColumn
from rich.table import Table

from thot_ingest.catalog import Catalog, scan
from thot_ingest.config import get_settings

app = typer.Typer(
    no_args_is_help=True, add_completion=False, help="Ingestion de Thot : EPUB -> Postgres -> Qdrant."
)
index_app = typer.Typer(no_args_is_help=True, help="Index vectoriels (une collection Qdrant par modèle).")
app.add_typer(index_app, name="index")
console = Console()
DEFAULT_WORKERS = os.cpu_count() or 4

BooksDir = Annotated[Path | None, typer.Argument(help="Dossier des livres (défaut : BOOKS_DIR).")]
Workers = Annotated[int, typer.Option("--workers", "-w", help="Processus de lecture des EPUB.")]


def _progress() -> Progress:
    return Progress(
        TextColumn("[bold]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        TextColumn("{task.fields[current]}"),
        console=console,
    )


def _print_issues(catalog: Catalog) -> None:
    for issue in catalog.issues:
        style = "red" if issue.fatal else "yellow"
        console.print(
            f"[{style}]{'ERREUR' if issue.fatal else 'attention'}[/] {issue.path} : {issue.message}"
        )


def _items(catalog: Catalog):
    return [(w, e) for w in catalog.works for e in w.editions]


# --------------------------------------------------------------------- check
@app.command()
def check(
    books_dir: BooksDir = None,
    workers: Workers = DEFAULT_WORKERS,
    dump: Annotated[
        Path | None,
        typer.Option(
            help="Écrit le texte extrait (.txt) et la structure (.json) de chaque EPUB pour relecture."
        ),
    ] = None,
    language_check: Annotated[bool, typer.Option(help="Vérifie la langue de chaque édition.")] = True,
) -> None:
    """Valide books/ et lit chaque EPUB, sans rien écrire en base."""
    from thot_ingest.pipeline.extract import dump_edition, parse_all

    books_dir = books_dir or get_settings().books_dir
    catalog = scan(books_dir)
    _print_issues(catalog)
    items = _items(catalog)

    table = Table(title=f"{len(catalog.works)} œuvres, {len(items)} éditions")
    for col in ("fichier", "langue", "structure", "chapitres", "segments (corps)", "notes", "remarques"):
        table.add_column(col)
    failed = 0
    with _progress() as progress:
        task = progress.add_task("Lecture", total=len(items), current="")
        for r in parse_all(items, workers, language_check):
            progress.update(task, advance=1, current=r.spec.source_file)
            if r.parsed is None:
                failed += 1
                table.add_row(r.spec.source_file, r.spec.language, "", "", "", "", f"[red]{r.error}")
                continue
            if dump:
                dump_edition(r, dump)
            stats = r.parsed.stats()
            chapters = sum(1 for s in r.parsed.text.sections if s.kind == "chapter")
            lang = r.spec.language + (
                ""
                if r.detected_language in (None, r.spec.language.split("-")[0])
                else f" [red](détectée : {r.detected_language})"
            )
            remarks = "; ".join(r.parsed.warnings)
            if r.error:
                failed += 1
                remarks = f"[red]{r.error}[/] {remarks}"
            table.add_row(
                r.spec.source_file,
                lang,
                r.parsed.structure_method,
                str(chapters),
                str(stats["body_segments"]),
                str(stats["notes"]),
                remarks,
            )
    console.print(table)
    if dump:
        console.print(f"Extraction lisible écrite dans {dump}")
    if catalog.errors or failed:
        raise typer.Exit(1)


# ------------------------------------------------------------------- extract
@app.command()
def extract(
    books_dir: BooksDir = None,
    workers: Workers = DEFAULT_WORKERS,
    force: Annotated[bool, typer.Option(help="Ré-extrait même les fichiers inchangés.")] = False,
    language_check: Annotated[
        bool, typer.Option(help="Refuse une édition dont la langue ne correspond pas à la fiche.")
    ] = True,
) -> None:
    """EPUB -> Postgres (œuvres, éditions, structure, texte, notes, pages) et
    EPUB -> MinIO. Les éditions inchangées ne sont pas relues, mais leur fiche
    (droits, éditeur, traducteurs…) est mise à jour."""
    from thot_core import qdrant as qstore
    from thot_core import s3
    from thot_ingest.pipeline.extract import needs_extract, parse_all
    from thot_ingest.pipeline.index import sync_edition_payload
    from thot_ingest.store.pg import Store, connect

    settings = get_settings()
    catalog = scan(books_dir or settings.books_dir)
    _print_issues(catalog)
    conn = connect(settings.database_url)
    store = Store(conn)
    mc = s3.client(settings.minio_endpoint, settings.minio_root_user, settings.minio_root_password)
    bucket = settings.minio_books_bucket
    if mc is None:
        console.print("[yellow]MINIO_ENDPOINT vide : les EPUB ne sont pas envoyés dans MinIO.")
    else:
        s3.ensure_bucket(mc, bucket)

    work_ids = {w.slug: store.upsert_work(w) for w in catalog.works}
    todo = [(w, e) for w, e in _items(catalog) if needs_extract(store, e, force)]
    todo_files = {e.source_file for _, e in todo}
    unchanged = [e for _, e in _items(catalog) if e.source_file not in todo_files]
    if unchanged:
        console.print(f"{len(unchanged)} édition(s) inchangée(s), texte non relu (--force pour le refaire)")
    for spec in unchanged:
        state = store.edition_state(spec.source_file)
        assert state is not None
        key = None
        if mc and state.epub_object_key is None:
            key = s3.put_epub(mc, bucket, spec.path, state.sha256)
        changed = store.sync_edition(spec, key)
        if changed:
            console.print(f"Fiche mise à jour : {spec.source_file} ({', '.join(changed)})")
        if "access" in changed:
            # Les droits sont aussi dans le payload Qdrant (filtre de la recherche).
            sync_edition_payload(conn, qstore.client(settings.qdrant_url, settings.qdrant_api_key), state.id)

    ok = failed = 0
    with _progress() as progress:
        task = progress.add_task("Extraction", total=len(todo), current="")
        for r in parse_all(todo, workers, language_check):
            progress.update(task, advance=1, current=r.spec.source_file)
            ingestion = store.start_ingestion(r.spec.source_file)
            error = r.error
            edition_id = None
            n_segments = 0
            if error is None:
                try:
                    key = s3.put_epub(mc, bucket, r.spec.path, r.parsed.sha256) if mc else None
                    saved = store.save_edition(
                        work_ids[r.work.slug], r.spec, r.parsed, r.work.title, epub_key=key
                    )
                    edition_id = saved.id
                    n_segments = len(r.parsed.text.segments)
                    if mc and saved.previous_epub_key and saved.previous_epub_key != key:
                        s3.remove(mc, bucket, saved.previous_epub_key)
                except Exception as e:  # rapportée dans `ingestions` et à l'écran
                    error = f"{type(e).__name__}: {e}"
            store.finish_ingestion(ingestion, edition_id=edition_id, error=error, n_segments=n_segments)
            if error:
                failed += 1
                console.print(f"[red]ÉCHEC[/] {r.spec.source_file} : {error}")
            else:
                ok += 1
    console.print(f"[green]{ok} extraite(s)[/], [red]{failed} en échec[/]")
    if failed:
        raise typer.Exit(1)


# --------------------------------------------------------------------- index
@index_app.command("create")
def index_create(
    dense_model: Annotated[str | None, typer.Option(help="Modèle dense (défaut : EMBEDDING_MODEL).")] = None,
    dim: Annotated[int | None, typer.Option(help="Dimension des vecteurs (défaut : VECTOR_SIZE).")] = None,
    chunker: Annotated[str, typer.Option(help="Version du découpage.")] = "v1",
    collection: Annotated[str | None, typer.Option(help="Nom de la collection Qdrant.")] = None,
) -> None:
    """Déclare un nouvel index et crée sa collection Qdrant (statut 'building')."""
    from thot_core import qdrant as qstore
    from thot_ingest.pipeline.index import create_index
    from thot_ingest.store.pg import connect

    s = get_settings()
    index = create_index(
        connect(s.database_url),
        qstore.client(s.qdrant_url, s.qdrant_api_key),
        dense_model or s.embedding_model,
        dim or s.vector_size,
        chunker,
        collection,
    )
    console.print(
        f"Index [bold]{index.collection}[/] créé ({index.dense_model}, {index.dense_dim} dim., "
        f"découpage {index.chunker_version})."
    )
    console.print(f"Remplissage : thot index run {index.collection}")


@index_app.command("run")
def index_run(
    collection: Annotated[str, typer.Argument(help="Collection de l'index à remplir.")],
    limit: Annotated[int | None, typer.Option(help="Nombre maximal d'éditions à traiter.")] = None,
) -> None:
    """Vectorise les éditions pas encore indexées (reprend après interruption)."""
    from thot_core import qdrant as qstore
    from thot_core.embed.dense import DenseEncoder
    from thot_ingest.pipeline.index import get_index, index_edition, pending_editions
    from thot_ingest.store.pg import Store, connect

    s = get_settings()
    conn = connect(s.database_url)
    store = Store(conn)
    qc = qstore.client(s.qdrant_url, s.qdrant_api_key)
    index = get_index(conn, collection)
    if index is None:
        console.print(f"[red]Index inconnu : {collection}[/] (voir : thot index list)")
        raise typer.Exit(1)
    editions = pending_editions(conn, index)[:limit]
    if not editions:
        console.print("Rien à indexer.")
        return

    console.print(f"Chargement de {index.dense_model}…")
    encoder = DenseEncoder(index.dense_model, s.device, s.embed_batch_size)
    if encoder.dim != index.dense_dim:
        console.print(
            f"[red]Le modèle produit {encoder.dim} dimensions, l'index en attend {index.dense_dim}."
        )
        raise typer.Exit(1)
    console.print(f"Modèle chargé sur [bold]{encoder.device}[/].")

    total_chunks = total_tokens = failed = 0
    start = time.monotonic()
    with _progress() as progress:
        task = progress.add_task("Indexation", total=len(editions), current="")
        for edition in editions:
            progress.update(task, current=edition["source_file"])
            ingestion = store.start_ingestion(edition["source_file"], edition["id"], index.id)
            try:
                n_chunks, n_tokens = index_edition(conn, qc, index, encoder, edition)
                store.finish_ingestion(ingestion, n_chunks=n_chunks)
                total_chunks += n_chunks
                total_tokens += n_tokens
            except Exception as e:  # rapportée dans `ingestions` et à l'écran
                failed += 1
                store.finish_ingestion(ingestion, error=f"{type(e).__name__}: {e}")
                console.print(f"[red]ÉCHEC[/] {edition['source_file']} : {e}")
            progress.update(task, advance=1)
    elapsed = time.monotonic() - start
    console.print(
        f"{total_chunks} chunks, {total_tokens} tokens en {elapsed:.0f} s "
        f"→ [bold]{total_tokens / max(elapsed, 1e-9):.0f} tokens/s[/]"
    )
    if failed:
        raise typer.Exit(1)


@index_app.command("sync-payload")
def index_sync_payload(
    collection: Annotated[str | None, typer.Argument(help="Collection (défaut : tous les index).")] = None,
) -> None:
    """Recopie dans Qdrant les champs du payload modifiables sans réindexer
    (droits `access`). Rattrape les points indexés avant l'ajout d'un champ."""
    from thot_core import qdrant as qstore
    from thot_ingest.pipeline.index import sync_edition_payload
    from thot_ingest.store.pg import connect

    s = get_settings()
    conn = connect(s.database_url)
    qc = qstore.client(s.qdrant_url, s.qdrant_api_key)
    rows = conn.execute(
        "SELECT DISTINCT ei.edition_id FROM edition_indexings ei JOIN vector_indexes v ON v.id = ei.index_id "
        "WHERE %(c)s::text IS NULL OR v.collection = %(c)s",
        {"c": collection},
    ).fetchall()
    for r in rows:
        sync_edition_payload(conn, qc, r["edition_id"], collection)
    console.print(f"Payload mis à jour pour {len(rows)} édition(s).")


@index_app.command("activate")
def index_activate(collection: Annotated[str, typer.Argument()]) -> None:
    """Bascule l'alias de recherche (QDRANT_COLLECTION) vers cet index."""
    from thot_core import qdrant as qstore
    from thot_ingest.pipeline.index import activate_index
    from thot_ingest.store.pg import connect

    s = get_settings()
    activate_index(
        connect(s.database_url),
        qstore.client(s.qdrant_url, s.qdrant_api_key),
        collection,
        s.qdrant_collection,
    )
    console.print(f"Alias [bold]{s.qdrant_collection}[/] → {collection}")


@index_app.command("list")
def index_list() -> None:
    """Liste les index et leur avancement."""
    from thot_ingest.pipeline.index import list_indexes
    from thot_ingest.store.pg import connect

    rows = list_indexes(connect(get_settings().database_url))
    table = Table()
    for col in ("collection", "modèle dense", "découpage", "statut", "éditions", "points"):
        table.add_column(col)
    for r in rows:
        table.add_row(
            r["collection"],
            r["dense_model"],
            r["chunker_version"],
            r["status"],
            str(r["editions"]),
            str(r["points"]),
        )
    console.print(table)


# --------------------------------------------------------------------- align
@app.command()
def align(
    work: Annotated[str | None, typer.Option(help="Slug d'une seule œuvre (auteur/oeuvre).")] = None,
    force: Annotated[bool, typer.Option(help="Réaligne même les œuvres corrigées à la main.")] = False,
) -> None:
    """Aligne les traductions de chaque œuvre disponible en plusieurs éditions."""
    from thot_ingest.pipeline.align import AlignEncoder, align_work, works_to_align
    from thot_ingest.store.pg import connect

    s = get_settings()
    conn = connect(s.database_url)
    works = works_to_align(conn, work)
    if not works:
        console.print("Aucune œuvre avec au moins deux éditions extraites.")
        return
    console.print(f"Chargement de {s.align_model}…")
    encoder = AlignEncoder(s.align_model, s.device)

    table = Table(title="Qualité de l'alignement")
    for col in (
        "édition",
        "statut",
        "segments alignés",
        "score moyen",
        "scores faibles",
        "chapitres appariés",
    ):
        table.add_column(col)
    for w in works:
        console.print(f"Alignement de [bold]{w['slug']}[/] ({w['n_editions']} éditions)…")
        try:
            reports = align_work(conn, encoder, w, force)
        except RuntimeError as e:
            console.print(f"[yellow]{w['slug']} ignorée : {e}")
            continue
        for r in reports:
            if r["status"] == "reference":
                table.add_row(r["source_file"], "référence", "", "", "", "")
                continue
            style = "green" if r["status"] == "reliable" else "yellow"
            table.add_row(
                r["source_file"],
                f"[{style}]{r['status']}",
                f"{r['n_aligned']}/{r['n_segments']} ({r['aligned_ratio']:.0%})",
                f"{r['mean_score']:.2f}" if r["mean_score"] is not None else "-",
                f"{r['low_score_ratio']:.0%}",
                str(r["sections_matched"]),
            )
    console.print(table)


# -------------------------------------------------------------------- status
@app.command()
def status() -> None:
    """Avancement de chaque étape."""
    from thot_ingest.pipeline.index import list_indexes
    from thot_ingest.store.pg import connect

    conn = connect(get_settings().database_url)
    counts = conn.execute(
        """
        SELECT (SELECT count(*) FROM works) AS works,
               (SELECT count(*) FROM editions) AS editions,
               (SELECT count(DISTINCT edition_id) FROM segments) AS extracted,
               (SELECT count(*) FROM segments) AS segments,
               (SELECT count(*) FROM ingestions WHERE status = 'failed') AS failed
        """
    ).fetchone()
    console.print(
        f"Œuvres : {counts['works']}  ·  éditions : {counts['editions']} "
        f"(extraites : {counts['extracted']})  ·  segments : {counts['segments']}  ·  "
        f"ingestions en échec : {counts['failed']}"
    )
    for r in list_indexes(conn):
        console.print(
            f"Index {r['collection']} [{r['status']}] : {r['editions']}/{counts['extracted']} "
            f"éditions, {r['points']} points"
        )
    for r in conn.execute(
        "SELECT status::text AS status, count(*) AS n FROM edition_alignments GROUP BY 1 ORDER BY 1"
    ).fetchall():
        console.print(f"Alignement {r['status']} : {r['n']} édition(s)")


# -------------------------------------------------------------------- search
@app.command()
def search(
    query: Annotated[str, typer.Argument(help="Thème, description ou citation.")],
    mode: Annotated[
        str, typer.Option(help="theme (sens), quote (citation : sens + mots) ou words (mots exacts).")
    ] = "theme",
    lang: Annotated[list[str] | None, typer.Option(help="Ne chercher que dans ces langues.")] = None,
    show: Annotated[str | None, typer.Option(help="Afficher aussi le passage dans cette langue.")] = None,
    year_min: Annotated[int | None, typer.Option()] = None,
    year_max: Annotated[int | None, typer.Option()] = None,
    original: Annotated[bool, typer.Option(help="Seulement les éditions originales.")] = False,
    limit: Annotated[int, typer.Option(help="Nombre d'œuvres.")] = 5,
    collection: Annotated[
        str | None, typer.Option(help="Collection ou alias (défaut : QDRANT_COLLECTION).")
    ] = None,
) -> None:
    """Recherche hybride, un résultat par œuvre."""
    from thot_core import qdrant as qstore
    from thot_core.embed.dense import DenseEncoder
    from thot_ingest.pipeline.index import get_index
    from thot_ingest.search import search as run_search
    from thot_ingest.store.pg import connect

    s = get_settings()
    conn = connect(s.database_url)
    qc = qstore.client(s.qdrant_url, s.qdrant_api_key)
    target = collection or s.qdrant_collection
    real = qstore.alias_target(qc, target) or target
    index = get_index(conn, real)
    if index is None:
        console.print(f"[red]Index introuvable pour {target}[/] (thot index activate <collection> ?)")
        raise typer.Exit(1)
    encoder = DenseEncoder(index.dense_model, s.device)
    hits = run_search(
        conn,
        qc,
        encoder,
        real,
        query,
        mode=mode,
        languages=lang,
        year_min=year_min,
        year_max=year_max,
        original_only=original,
        limit=limit,
        show_language=show,
    )
    for i, h in enumerate(hits, 1):
        title = f"{i}. {h.work_title} — {', '.join(h.authors)}  [{h.language}] {h.section_path or ''}"
        body = h.text if len(h.text) < 1500 else h.text[:1500] + "…"
        if h.translation_language:
            trans = h.translation or "(pas de passage aligné dans cette langue)"
            body += f"\n\n[dim]── {h.translation_language} ──[/]\n{trans[:1500]}"
        console.print(Panel(body, title=title, subtitle=f"score {h.score:.3f}", title_align="left"))
