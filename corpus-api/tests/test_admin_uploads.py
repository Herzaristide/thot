"""Dépôts et validation du classement (sans écrire dans le stockage S3 :
seuls les cas refusés avant l'envoi sont testés ici)."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from psycopg.types.json import Jsonb

BOOKS = Path(__file__).resolve().parents[2] / "books"


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()


@pytest.fixture
def s3_available(app, client):
    if app.state.s3 is None:
        pytest.skip("stockage S3 désactivé")


def test_upload_rejects_non_epub(client, admin, s3_available):
    r = client.post(
        "/v1/admin/uploads",
        files=[
            ("files", ("notes.txt", b"pas un zip", "text/plain")),
            ("files", ("vide.epub", _zip({"mimetype": b"application/epub+zip"}), "application/epub+zip")),
        ],
    )
    assert r.status_code == 201, r.text
    items = r.json()["items"]
    assert [i["status"] for i in items] == ["invalid", "invalid"]
    assert "ZIP" in items[0]["message"] and "container.xml" in items[1]["message"]


def test_upload_detects_duplicate(client, admin, s3_available, db):
    path = next(BOOKS.glob("*/*/*.epub"), None)
    if path is None:
        pytest.skip("aucun EPUB dans books/")
    r = client.post(
        "/v1/admin/uploads", files=[("files", (path.name, path.read_bytes(), "application/epub+zip"))]
    )
    assert r.status_code == 201, r.text
    item = r.json()["items"][0]
    assert item["status"] == "duplicate" and item["existing_edition_id"]


def test_upload_options_validated(client, admin, s3_available):
    r = client.post(
        "/v1/admin/uploads",
        files=[("files", ("a.epub", b"x", "application/epub+zip"))],
        data={"options": '{"language": "français"}'},
    )
    assert r.status_code == 422


def test_upload_requires_admin(client, reviewer):
    r = client.post("/v1/admin/uploads", files=[("files", ("a.epub", b"x", "application/epub+zip"))])
    assert r.status_code == 403


@pytest.fixture
def pending_upload(db):
    job = db.execute(
        """
        INSERT INTO jobs (kind, title, status, params, result)
        VALUES ('ingest', 'Dépôt de test.epub', 'needs_review', %s, %s) RETURNING id
        """,
        (Jsonb({"object_key": "absent.epub", "sha256": "0" * 64}), Jsonb({"identification": {}})),
    ).fetchone()
    yield job["id"]
    db.execute("DELETE FROM jobs WHERE id = %s", (job["id"],))


def test_resolve_validates(client, admin, pending_upload, db):
    url = f"/v1/admin/jobs/{pending_upload}/resolve"
    assert client.post(url, json={"action": "attach"}).status_code == 400
    assert client.post(url, json={"action": "create_work", "edition": {"language": "fr"}}).status_code == 400
    bad_lang = {
        "action": "attach",
        "work_id": "00000000-0000-0000-0000-000000000000",
        "edition": {"language": "x"},
    }
    assert client.post(url, json=bad_lang).status_code == 422
    missing = {
        "action": "attach",
        "work_id": "00000000-0000-0000-0000-000000000000",
        "edition": {"language": "fr"},
    }
    assert client.post(url, json=missing).status_code == 404


def test_resolve_requeues_with_resolution(client, admin, pending_upload, db):
    work = db.execute("SELECT id FROM works ORDER BY slug LIMIT 1").fetchone()
    body = {"action": "attach", "work_id": str(work["id"]), "edition": {"language": "fr", "title": "Titre"}}
    r = client.post(f"/v1/admin/jobs/{pending_upload}/resolve", json=body)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "queued" and job["work_id"] == str(work["id"])
    assert job["params"]["resolution"]["action"] == "attach"
    assert job["params"]["resolution"]["edition"]["access"] == "restricted"
    # Déjà en file : plus validable
    assert client.post(f"/v1/admin/jobs/{pending_upload}/resolve", json=body).status_code == 409
