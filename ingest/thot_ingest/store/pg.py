"""Accès Postgres : catalogue (œuvres, personnes, éditions) et texte des éditions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from thot_ingest.catalog import EditionSpec, WorkSpec
from thot_ingest.parse import ParsedEdition


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, autocommit=True, row_factory=dict_row)


def emit(
    conn: psycopg.Connection,
    type_: str,
    work_id: uuid.UUID | None = None,
    edition_id: uuid.UUID | None = None,
    data: dict | None = None,
) -> None:
    """Journalise un changement du corpus (flux /v1/changes de l'API). À
    appeler dans la transaction de la modification."""
    conn.execute("SELECT corpus_emit(%s, %s, %s, %s)", (type_, work_id, edition_id, Jsonb(data or {})))


class DuplicateFileError(Exception):
    pass


@dataclass
class EditionState:
    id: uuid.UUID
    sha256: str
    has_text: bool
    epub_object_key: str | None


@dataclass
class SavedEdition:
    id: uuid.UUID
    previous_epub_key: str | None  # objet à supprimer s'il diffère du nouveau


class Store:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    # ------------------------------------------------------------ personnes
    def person_id(self, name: str) -> uuid.UUID:
        """Personne reconnue par son nom exact (sans identifiant Wikidata)."""
        row = self.conn.execute(
            "SELECT id FROM persons WHERE display_name = %s ORDER BY created_at LIMIT 1", (name,)
        ).fetchone()
        if row:
            return row["id"]
        return self.conn.execute(
            "INSERT INTO persons (display_name) VALUES (%s) RETURNING id", (name,)
        ).fetchone()["id"]

    # --------------------------------------------------------------- œuvres
    def _work_snapshot(self, slug: str) -> dict | None:
        return self.conn.execute(
            """
            SELECT w.title, w.original_language, w.first_published_year, w.wikidata_id,
                   array(SELECT p.display_name FROM work_authors wa JOIN persons p ON p.id = wa.person_id
                         WHERE wa.work_id = w.id ORDER BY wa.position) AS authors,
                   array(SELECT m.slug FROM work_movements wm JOIN movements m ON m.id = wm.movement_id
                         WHERE wm.work_id = w.id ORDER BY m.slug) AS movements
            FROM works w WHERE w.slug = %s
            """,
            (slug,),
        ).fetchone()

    def upsert_work(self, work: WorkSpec) -> uuid.UUID:
        with self.conn.transaction():
            before = self._work_snapshot(work.slug)
            work_id = self.conn.execute(
                """
                INSERT INTO works (slug, title, original_language, first_published_year, wikidata_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    title = EXCLUDED.title,
                    original_language = EXCLUDED.original_language,
                    first_published_year = EXCLUDED.first_published_year,
                    wikidata_id = EXCLUDED.wikidata_id
                RETURNING id
                """,
                (work.slug, work.title, work.original_language, work.first_published_year, work.wikidata),
            ).fetchone()["id"]

            if work.original_language:
                self.conn.execute(
                    "INSERT INTO work_titles (work_id, language, title) VALUES (%s, %s, %s) "
                    "ON CONFLICT DO NOTHING",
                    (work_id, work.original_language, work.title),
                )

            self.conn.execute("DELETE FROM work_authors WHERE work_id = %s", (work_id,))
            for pos, name in enumerate(work.authors):
                self.conn.execute(
                    "INSERT INTO work_authors (work_id, person_id, position) VALUES (%s, %s, %s) "
                    "ON CONFLICT DO NOTHING",
                    (work_id, self.person_id(name), pos),
                )

            self.conn.execute("DELETE FROM work_movements WHERE work_id = %s", (work_id,))
            for slug in work.movements:
                movement_id = self.conn.execute(
                    "INSERT INTO movements (slug) VALUES (%s) "
                    "ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id",
                    (slug,),
                ).fetchone()["id"]
                self.conn.execute(
                    "INSERT INTO work_movements (work_id, movement_id) VALUES (%s, %s)",
                    (work_id, movement_id),
                )

            if before is None:
                emit(self.conn, "work.created", work_id)
            else:
                after = self._work_snapshot(work.slug)
                changed = [k for k in before if before[k] != after[k]]
                if changed:
                    emit(self.conn, "work.updated", work_id, data={"fields": changed})
        return work_id

    # ------------------------------------------------------------- éditions
    def edition_state(self, source_file: str) -> EditionState | None:
        row = self.conn.execute(
            """
            SELECT e.id, e.sha256, e.epub_object_key,
                   EXISTS (SELECT 1 FROM segments s WHERE s.edition_id = e.id) AS has_text
            FROM editions e WHERE e.source_file = %s
            """,
            (source_file,),
        ).fetchone()
        if row is None:
            return None
        return EditionState(row["id"], row["sha256"], row["has_text"], row["epub_object_key"])

    def _set_translators(self, edition_id: uuid.UUID, names: list[str]) -> None:
        self.conn.execute("DELETE FROM edition_contributors WHERE edition_id = %s", (edition_id,))
        for pos, name in enumerate(names):
            self.conn.execute(
                "INSERT INTO edition_contributors (edition_id, person_id, role, position) "
                "VALUES (%s, %s, 'translator', %s) ON CONFLICT DO NOTHING",
                (edition_id, self.person_id(name), pos),
            )

    def _edition_snapshot(self, edition_id: uuid.UUID) -> dict:
        return self.conn.execute(
            """
            SELECT e.title, e.is_original, e.publisher, e.year, e.access::text AS access,
                   e.epub_object_key,
                   array(SELECT p.display_name FROM edition_contributors c
                         JOIN persons p ON p.id = c.person_id
                         WHERE c.edition_id = e.id AND c.role = 'translator'
                         ORDER BY c.position) AS translators
            FROM editions e WHERE e.id = %s
            """,
            (edition_id,),
        ).fetchone()

    def sync_edition(self, spec: EditionSpec, epub_key: str | None) -> list[str]:
        """Met à jour les métadonnées d'une édition dont le texte est inchangé
        (fiche work.toml modifiée, EPUB pas encore stocké). Renvoie les champs
        modifiés."""
        with self.conn.transaction():
            row = self.conn.execute(
                "SELECT id, work_id FROM editions WHERE source_file = %s", (spec.source_file,)
            ).fetchone()
            before = self._edition_snapshot(row["id"])
            self.conn.execute(
                """
                UPDATE editions SET title = coalesce(%s, title), is_original = %s, publisher = %s,
                       year = %s, access = %s, epub_object_key = coalesce(%s, epub_object_key)
                WHERE id = %s
                """,
                (spec.title, spec.original, spec.publisher, spec.year, spec.access, epub_key, row["id"]),
            )
            if before["translators"] != spec.translators:
                self._set_translators(row["id"], spec.translators)
            after = self._edition_snapshot(row["id"])
            changed = [k for k in before if before[k] != after[k]]
            if changed:
                emit(self.conn, "edition.updated", row["work_id"], row["id"], {"fields": changed})
        return changed

    def save_edition(
        self,
        work_id: uuid.UUID,
        spec: EditionSpec,
        parsed: ParsedEdition,
        fallback_title: str,
        epub_key: str | None = None,
    ) -> SavedEdition:
        """Crée ou remplace une édition et tout son texte, en une transaction.
        Remplacer le texte incrémente la révision de l'édition."""
        title = spec.title or (parsed.metadata.titles[0] if parsed.metadata.titles else fallback_title)
        with self.conn.transaction():
            clash = self.conn.execute(
                "SELECT source_file FROM editions WHERE sha256 = %s AND source_file <> %s",
                (parsed.sha256, spec.source_file),
            ).fetchone()
            if clash:
                raise DuplicateFileError(f"fichier identique déjà importé sous {clash['source_file']}")

            existing = self.conn.execute(
                "SELECT id, work_id, revision, epub_object_key FROM editions WHERE source_file = %s",
                (spec.source_file,),
            ).fetchone()
            if existing:
                self._delete_text(existing["id"], existing["work_id"])

            edition = self.conn.execute(
                """
                INSERT INTO editions (work_id, sha256, title, language, is_original, publisher,
                                      year, source_file, access, epub_object_key)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source_file) DO UPDATE SET
                    work_id = EXCLUDED.work_id, sha256 = EXCLUDED.sha256, title = EXCLUDED.title,
                    language = EXCLUDED.language, is_original = EXCLUDED.is_original,
                    publisher = EXCLUDED.publisher, year = EXCLUDED.year, access = EXCLUDED.access,
                    epub_object_key = EXCLUDED.epub_object_key,
                    revision = editions.revision + 1
                RETURNING id, revision
                """,
                (
                    work_id,
                    parsed.sha256,
                    title,
                    spec.language,
                    spec.original,
                    spec.publisher,
                    spec.year,
                    spec.source_file,
                    spec.access,
                    epub_key,
                ),
            ).fetchone()
            edition_id = edition["id"]

            self.conn.execute(
                "INSERT INTO work_titles (work_id, language, title) VALUES (%s, %s, %s) "
                "ON CONFLICT DO NOTHING",
                (work_id, spec.language, title),
            )
            self._set_translators(edition_id, spec.translators)
            self._copy_text(edition_id, parsed)
            if existing:
                emit(
                    self.conn,
                    "edition.text_replaced",
                    work_id,
                    edition_id,
                    {"old_revision": existing["revision"], "new_revision": edition["revision"]},
                )
            else:
                emit(self.conn, "edition.created", work_id, edition_id)
        return SavedEdition(edition_id, existing["epub_object_key"] if existing else None)

    def _delete_text(self, edition_id: uuid.UUID, work_id: uuid.UUID) -> None:
        """Supprime le texte d'une édition et ce qui en dépend (chunks,
        alignements, indexation). Si l'édition était la référence d'alignement
        de son œuvre, tout l'alignement de l'œuvre est à refaire."""
        is_reference = self.conn.execute(
            "SELECT 1 FROM edition_alignments WHERE edition_id = %s AND reference_edition_id IS NULL",
            (edition_id,),
        ).fetchone()
        if is_reference:
            self.conn.execute("DELETE FROM work_units WHERE work_id = %s", (work_id,))
            self.conn.execute(
                "DELETE FROM edition_alignments WHERE edition_id IN "
                "(SELECT id FROM editions WHERE work_id = %s)",
                (work_id,),
            )
            emit(self.conn, "work.alignment_changed", work_id, data={"reason": "reference_text_replaced"})
        self.conn.execute("DELETE FROM edition_alignments WHERE edition_id = %s", (edition_id,))
        self.conn.execute("DELETE FROM edition_indexings WHERE edition_id = %s", (edition_id,))
        self.conn.execute("DELETE FROM segments WHERE edition_id = %s", (edition_id,))
        self.conn.execute("DELETE FROM page_breaks WHERE edition_id = %s", (edition_id,))
        self.conn.execute("DELETE FROM sections WHERE edition_id = %s", (edition_id,))

    def _copy_text(self, edition_id: uuid.UUID, parsed: ParsedEdition) -> None:
        text = parsed.text
        cur = self.conn.cursor()
        with cur.copy(
            "COPY sections (id, edition_id, parent_id, seq, kind, matter, label, title, number, "
            "source_href) FROM STDIN"
        ) as copy:
            for s in text.sections:
                copy.write_row(
                    (
                        s.id,
                        edition_id,
                        s.parent_id,
                        s.seq,
                        s.kind,
                        s.matter,
                        s.label,
                        s.title,
                        s.number,
                        s.source_href,
                    )
                )
        with cur.copy(
            "COPY segments (id, edition_id, section_id, seq, kind, char_start, char_end, text, "
            "markup) FROM STDIN"
        ) as copy:
            for s in text.segments:
                copy.write_row(
                    (
                        s.id,
                        edition_id,
                        s.section_id,
                        s.seq,
                        s.kind,
                        s.char_start,
                        s.char_end,
                        s.text,
                        s.markup,
                    )
                )
        with cur.copy(
            "COPY note_refs (segment_id, char_offset, label, note_section_id, origin) FROM STDIN"
        ) as copy:
            for r in text.note_refs:
                copy.write_row((r.segment_id, r.char_offset, r.label, r.note_section_id, r.origin))
        with cur.copy("COPY page_breaks (edition_id, char_offset, label) FROM STDIN") as copy:
            for p in text.page_breaks:
                copy.write_row((edition_id, p.char_offset, p.label))

    # ----------------------------------------------------------- ingestions
    def start_ingestion(
        self, source_file: str, edition_id: uuid.UUID | None = None, index_id: uuid.UUID | None = None
    ) -> uuid.UUID:
        return self.conn.execute(
            "INSERT INTO ingestions (source_file, edition_id, index_id, status) "
            "VALUES (%s, %s, %s, 'running') RETURNING id",
            (source_file, edition_id, index_id),
        ).fetchone()["id"]

    def finish_ingestion(
        self,
        ingestion_id: uuid.UUID,
        *,
        edition_id: uuid.UUID | None = None,
        error: str | None = None,
        n_segments: int = 0,
        n_chunks: int = 0,
    ) -> None:
        self.conn.execute(
            """
            UPDATE ingestions SET status = %s, edition_id = coalesce(%s, edition_id),
                   error = %s, n_segments = %s, n_chunks = %s, finished_at = now()
            WHERE id = %s
            """,
            ("failed" if error else "succeeded", edition_id, error, n_segments, n_chunks, ingestion_id),
        )
