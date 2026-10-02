"""Étape 1 : EPUB -> Postgres (œuvres, éditions, sections, segments, notes, pages).

Lecture des EPUB en parallèle (processus), écriture en base séquentielle dans
le processus principal (pas de concurrence sur les personnes / œuvres).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from thot_ingest.catalog import EditionSpec, WorkSpec
from thot_ingest.epub.container import sha256_file
from thot_ingest.parse import ParsedEdition, parse_epub
from thot_ingest.text.language import detect_language, same_language


@dataclass
class EditionResult:
    work: WorkSpec
    spec: EditionSpec
    parsed: ParsedEdition | None
    error: str | None
    detected_language: str | None = None


def _parse(path: Path) -> ParsedEdition:
    return parse_epub(path)


def parse_all(
    items: list[tuple[WorkSpec, EditionSpec]], workers: int, check_language: bool = True
) -> Iterator[EditionResult]:
    """Lit les EPUB en parallèle et vérifie leur langue ; renvoie les résultats
    au fil de l'eau."""
    with ProcessPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(_parse, spec.path): (work, spec) for work, spec in items}
        for future in as_completed(futures):
            work, spec = futures[future]
            try:
                parsed = future.result()
            except Exception as e:  # noqa: BLE001 - toute erreur de lecture est rapportée
                yield EditionResult(work, spec, None, f"{type(e).__name__}: {e}")
                continue
            detected = detect_language(parsed.body_sample())
            error = None
            if check_language and not same_language(spec.language, detected):
                error = (
                    f"langue détectée {detected!r} différente de la fiche ({spec.language!r}) ; "
                    "corriger work.toml ou relancer avec --no-language-check"
                )
            yield EditionResult(work, spec, parsed, error, detected)


def dump_edition(result: EditionResult, out_dir: Path) -> Path:
    """Écrit une version lisible de l'extraction pour relecture humaine :
    <slug>/<fichier>.txt (texte structuré) et .json (statistiques, sections)."""
    parsed = result.parsed
    assert parsed is not None
    base = out_dir / result.spec.source_file
    base.parent.mkdir(parents=True, exist_ok=True)

    sections = {s.id: s for s in parsed.text.sections}
    depth: dict = {}
    for s in parsed.text.sections:
        depth[s.id] = 0 if s.parent_id is None else depth[s.parent_id] + 1
    notes_by_segment: dict = {}
    for r in parsed.text.note_refs:
        notes_by_segment.setdefault(r.segment_id, []).append(r)

    lines: list[str] = []
    current = None
    for seg in parsed.text.segments:
        if seg.section_id != current:
            current = seg.section_id
            s = sections[current]
            head = " — ".join(x for x in (s.label, s.title) if x) or "(sans titre)"
            lines.append(f"\n{'#' * (depth[s.id] + 1)} [{s.matter}/{s.kind}] {head}\n")
        text = seg.text
        for r in sorted(notes_by_segment.get(seg.id, []), key=lambda r: -r.char_offset):
            text = f"{text[: r.char_offset]}[^{r.label}]{text[r.char_offset :]}"
        prefix = {"heading": "> ", "verse": "| ", "quote": "» ", "epigraph": "~ ", "note": "^ "}
        lines.append(prefix.get(seg.kind, "") + text.replace("\n", "\n" + prefix.get(seg.kind, "")))
    base.with_suffix(".txt").write_text("\n\n".join(lines), "utf-8")

    summary = {
        "file": result.spec.source_file,
        "language": result.spec.language,
        "detected_language": result.detected_language,
        "structure_method": parsed.structure_method,
        "stats": parsed.stats(),
        "warnings": parsed.warnings,
        "error": result.error,
        "sections": [
            {
                "depth": depth[s.id],
                "kind": s.kind,
                "matter": s.matter,
                "number": s.number,
                "label": s.label,
                "title": s.title,
            }
            for s in parsed.text.sections
            if s.kind != "note"
        ],
    }
    base.with_suffix(".json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), "utf-8")
    return base.with_suffix(".txt")


def needs_extract(store, spec: EditionSpec, force: bool) -> bool:
    if force:
        return True
    state = store.edition_state(spec.source_file)
    return not (state and state.has_text and state.sha256 == sha256_file(spec.path))
