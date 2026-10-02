"""Étape 3 : alignement des traductions d'une même œuvre.

1. Édition de référence : l'originale, sinon celle qui a le plus de texte.
   Elle définit les `work_units` (une unité par segment du corps).
2. Chapitres : chaque section du corps d'une autre édition est appariée à une
   section de la référence (sens des paragraphes + numéro), dans l'ordre.
3. Paragraphes : à l'intérieur de chaque paire de chapitres, les segments sont
   alignés (1-1, 1-2, 2-1, ...) avec LaBSE ; chaque segment cible est relié
   aux unités des segments de référence correspondants.
4. Qualité par édition (`edition_alignments`) : part alignée, score moyen.

Les liens posés à la main (method = 'manual') ne sont jamais écrasés : une
œuvre qui en contient n'est réalignée qu'avec --force.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

import numpy as np
import psycopg

from thot_ingest.align.dp import align
from thot_ingest.store.pg import emit

METHOD = "thot-labse-v1"
PARAGRAPH_THRESHOLD = 0.40
SECTION_THRESHOLD = 0.30
LOW_SCORE = 0.50
RELIABLE = {"aligned_ratio": 0.85, "mean_score": 0.60, "low_score_ratio": 0.20}


@dataclass
class Sec:
    id: uuid.UUID
    number: int | None
    kind: str
    segments: list[dict] = field(default_factory=list)  # {id, seq, text}


class AlignEncoder:
    def __init__(self, model_name: str, device: str | None = None, batch_size: int = 64) -> None:
        from sentence_transformers import SentenceTransformer

        from thot_core.embed.dense import resolve_device

        self.device = resolve_device(device)
        self.model = SentenceTransformer(model_name, device=self.device)
        if self.device == "cuda":
            self.model.half()
        self.batch_size = batch_size

    def encode(self, texts: list[str]) -> np.ndarray:
        return self.model.encode(
            texts,
            batch_size=self.batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        ).astype(np.float32)


def works_to_align(conn: psycopg.Connection, slug: str | None = None) -> list[dict]:
    return conn.execute(
        """
        SELECT w.id, w.slug, w.title, count(e.id) AS n_editions
        FROM works w JOIN editions e ON e.work_id = w.id
        WHERE EXISTS (SELECT 1 FROM segments s WHERE s.edition_id = e.id)
          AND (%(slug)s::text IS NULL OR w.slug = %(slug)s)
        GROUP BY w.id HAVING count(e.id) >= 2
        ORDER BY w.slug
        """,
        {"slug": slug},
    ).fetchall()


def _load_sections(conn: psycopg.Connection, edition_id: uuid.UUID) -> list[Sec]:
    rows = conn.execute(
        """
        SELECT sec.id AS section_id, sec.number, sec.kind::text AS kind,
               s.id, s.seq, s.text
        FROM segments s JOIN sections sec ON sec.id = s.section_id
        WHERE s.edition_id = %s AND sec.matter = 'body' AND s.kind <> 'note'
        ORDER BY s.seq
        """,
        (edition_id,),
    ).fetchall()
    sections: dict[uuid.UUID, Sec] = {}
    for r in rows:
        sec = sections.setdefault(r["section_id"], Sec(r["section_id"], r["number"], r["kind"]))
        sec.segments.append({"id": r["id"], "seq": r["seq"], "text": r["text"]})
    return list(sections.values())


def _section_vectors(sections: list[Sec], seg_vec: dict) -> np.ndarray:
    out = []
    for s in sections:
        v = np.sum([seg_vec[x["id"]] for x in s.segments], axis=0)
        out.append(v / max(np.linalg.norm(v), 1e-9))
    return np.array(out, dtype=np.float32)


def _number_bonus(ref: list[Sec], tgt: list[Sec]) -> np.ndarray:
    bonus = np.zeros((len(ref), len(tgt)), dtype=np.float32)
    for i, a in enumerate(ref):
        for j, b in enumerate(tgt):
            if a.number is not None and b.number is not None and a.kind == b.kind:
                bonus[i, j] = 0.15 if a.number == b.number else -0.15
    return bonus


def align_work(
    conn: psycopg.Connection, encoder: AlignEncoder, work: dict, force: bool = False
) -> list[dict]:
    """Aligne toutes les éditions d'une œuvre ; retourne la qualité par édition."""
    manual = conn.execute(
        "SELECT 1 FROM segment_alignments sa JOIN work_units u ON u.id = sa.unit_id "
        "WHERE u.work_id = %s AND sa.method = 'manual' LIMIT 1",
        (work["id"],),
    ).fetchone()
    if manual and not force:
        raise RuntimeError("l'œuvre contient des liens corrigés à la main (relancer avec --force)")

    editions = conn.execute(
        """
        SELECT e.id, e.source_file, e.language, e.is_original,
               (SELECT count(*) FROM segments s JOIN sections sec ON sec.id = s.section_id
                 WHERE s.edition_id = e.id AND sec.matter = 'body') AS n_body
        FROM editions e WHERE e.work_id = %s
          AND EXISTS (SELECT 1 FROM segments s WHERE s.edition_id = e.id)
        """,
        (work["id"],),
    ).fetchall()
    reference = max(editions, key=lambda e: (e["is_original"], e["n_body"]))
    sections = {e["id"]: _load_sections(conn, e["id"]) for e in editions}

    all_segments = [x for secs in sections.values() for s in secs for x in s.segments]
    vectors = encoder.encode([x["text"] for x in all_segments])
    seg_vec = {x["id"]: v for x, v in zip(all_segments, vectors, strict=True)}

    ref_sections = sections[reference["id"]]
    ref_segments = [x for s in ref_sections for x in s.segments]
    unit_ids = [uuid.uuid4() for _ in ref_segments]
    unit_of = {x["id"]: u for x, u in zip(ref_segments, unit_ids, strict=True)}

    reports = []
    with conn.transaction():
        edition_ids = [e["id"] for e in editions]
        conn.execute("DELETE FROM work_units WHERE work_id = %s", (work["id"],))
        conn.execute("DELETE FROM edition_alignments WHERE edition_id = ANY(%s)", (edition_ids,))
        conn.execute(
            "UPDATE sections SET reference_section_id = NULL WHERE edition_id = ANY(%s)",
            (edition_ids,),
        )
        cur = conn.cursor()
        with cur.copy("COPY work_units (id, work_id, seq) FROM STDIN") as copy:
            for seq, u in enumerate(unit_ids):
                copy.write_row((u, work["id"], seq))

        links: list[tuple] = [(x["id"], unit_of[x["id"]], None, "reference") for x in ref_segments]
        conn.execute(
            "INSERT INTO edition_alignments (edition_id, reference_edition_id, method, n_segments, "
            "n_aligned_segments, status) VALUES (%s, NULL, 'reference', %s, %s, 'reliable')",
            (reference["id"], len(ref_segments), len(ref_segments)),
        )

        for edition in editions:
            if edition["id"] == reference["id"]:
                continue
            tgt_sections = sections[edition["id"]]
            report = _align_edition(ref_sections, tgt_sections, seg_vec, unit_of, links, cur)
            report["edition_id"] = edition["id"]
            report["source_file"] = edition["source_file"]
            status = (
                "reliable"
                if (
                    report["aligned_ratio"] >= RELIABLE["aligned_ratio"]
                    and (report["mean_score"] or 0) >= RELIABLE["mean_score"]
                    and report["low_score_ratio"] <= RELIABLE["low_score_ratio"]
                )
                else "doubtful"
            )
            report["status"] = status
            conn.execute(
                """
                INSERT INTO edition_alignments (edition_id, reference_edition_id, method,
                    n_segments, n_aligned_segments, mean_score, low_score_ratio, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    edition["id"],
                    reference["id"],
                    METHOD,
                    report["n_segments"],
                    report["n_aligned"],
                    report["mean_score"],
                    report["low_score_ratio"],
                    status,
                ),
            )
            reports.append(report)

        with cur.copy("COPY segment_alignments (segment_id, unit_id, score, method) FROM STDIN") as copy:
            for row in links:
                copy.write_row(row)
        emit(
            conn,
            "work.alignment_changed",
            work["id"],
            data={
                "reference_edition_id": str(reference["id"]),
                "editions": {str(r["edition_id"]): r["status"] for r in reports},
            },
        )
    return [{"source_file": reference["source_file"], "status": "reference"}, *reports]


def _align_edition(
    ref_sections: list[Sec], tgt_sections: list[Sec], seg_vec: dict, unit_of: dict, links: list[tuple], cur
) -> dict:
    n_segments = sum(len(s.segments) for s in tgt_sections)
    if not ref_sections or not tgt_sections:
        return {
            "n_segments": n_segments,
            "n_aligned": 0,
            "aligned_ratio": 0.0,
            "mean_score": None,
            "low_score_ratio": 1.0,
            "sections_matched": 0,
        }

    section_groups = align(
        _section_vectors(ref_sections, seg_vec),
        _section_vectors(tgt_sections, seg_vec),
        threshold=SECTION_THRESHOLD,
        bonus=_number_bonus(ref_sections, tgt_sections),
    )

    aligned: dict[uuid.UUID, float] = {}
    matched = 0
    for g in section_groups:
        if not g.a or not g.b:
            continue
        matched += 1
        ref_segs = [x for i in g.a for x in ref_sections[i].segments]
        tgt_segs = [x for j in g.b for x in tgt_sections[j].segments]
        if len(g.a) == 1 and len(g.b) == 1:
            cur.execute(
                "UPDATE sections SET reference_section_id = %s WHERE id = %s",
                (ref_sections[g.a[0]].id, tgt_sections[g.b[0]].id),
            )
        paragraphs = align(
            np.array([seg_vec[x["id"]] for x in ref_segs]),
            np.array([seg_vec[x["id"]] for x in tgt_segs]),
            threshold=PARAGRAPH_THRESHOLD,
            moves=((1, 1), (1, 2), (2, 1), (1, 3), (3, 1), (1, 0), (0, 1)),
            band=0.25 if max(len(ref_segs), len(tgt_segs)) > 200 else None,
        )
        for p in paragraphs:
            if not p.a or not p.b:
                continue
            for j in p.b:
                tgt_id = tgt_segs[j]["id"]
                aligned[tgt_id] = p.score
                for i in p.a:
                    links.append((tgt_id, unit_of[ref_segs[i]["id"]], round(p.score, 4), METHOD))

    scores = list(aligned.values())
    return {
        "n_segments": n_segments,
        "n_aligned": len(aligned),
        "aligned_ratio": len(aligned) / n_segments if n_segments else 0.0,
        "mean_score": float(np.mean(scores)) if scores else None,
        "low_score_ratio": (sum(s < LOW_SCORE for s in scores) / len(scores)) if scores else 1.0,
        "sections_matched": matched,
    }
