"""Modification des fiches et de la structure (/v1/admin), sur la copie jetable."""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def work(db):
    """Une œuvre à au moins deux éditions extraites."""
    return db.execute(
        """
        SELECT w.id, w.title FROM works w
        WHERE (SELECT count(*) FROM editions e WHERE e.work_id = w.id
               AND EXISTS (SELECT 1 FROM segments s WHERE s.edition_id = e.id)) >= 2
        ORDER BY w.slug LIMIT 1
        """
    ).fetchone()


def jobs_of(db, kind: str) -> list[dict]:
    return db.execute(
        "SELECT * FROM jobs WHERE kind = %s AND status = 'queued' ORDER BY created_at", (kind,)
    ).fetchall()


@pytest.fixture(autouse=True)
def clean_jobs(db):
    yield
    db.execute("DELETE FROM jobs")


def test_patch_work_with_etag(client, admin, work, db):
    r = client.get(f"/v1/admin/works/{work['id']}")
    assert r.status_code == 200
    etag, fiche = r.headers["etag"], r.json()
    assert len(fiche["editions"]) >= 2 and fiche["authors"]

    body = {
        "title": work["title"] + " (modifié)",
        "titles": [{"language": "fr", "title": "Titre français"}],
        "first_published_year": 1800,
    }
    r = client.patch(f"/v1/admin/works/{work['id']}", json=body, headers={"If-Match": etag})
    assert r.status_code == 200, r.text
    assert r.json()["title"].endswith("(modifié)")
    assert {"language": "fr", "title": "Titre français"} in r.json()["titles"]
    # L'année est dans le payload Qdrant : recopie demandée
    assert jobs_of(db, "sync_payload")
    event = db.execute("SELECT * FROM corpus_events ORDER BY id DESC LIMIT 1").fetchone()
    assert event["type"] == "work.updated" and event["actor"] == "test-user"

    # ETag périmé
    r = client.patch(f"/v1/admin/works/{work['id']}", json={"title": "x"}, headers={"If-Match": etag})
    assert r.status_code == 412
    client.patch(f"/v1/admin/works/{work['id']}", json={"title": work["title"]})


def test_patch_edition_access(client, admin, work, db):
    edition = client.get(f"/v1/admin/works/{work['id']}").json()["editions"][0]
    new = "open" if edition["access"] != "open" else "excerpt"
    r = client.patch(f"/v1/admin/editions/{edition['id']}", json={"access": new, "publisher": "Éd. test"})
    assert r.status_code == 200, r.text
    row = next(e for e in r.json()["editions"] if e["id"] == edition["id"])
    assert row["access"] == new and row["publisher"] == "Éd. test"
    sync = jobs_of(db, "sync_payload")[-1]
    assert sync["params"]["edition_ids"] == [edition["id"]]
    client.patch(f"/v1/admin/editions/{edition['id']}", json={"access": edition["access"]})


def test_trash_and_restore_edition(client, admin, work, db, app):
    edition = client.get(f"/v1/admin/works/{work['id']}").json()["editions"][0]
    assert client.delete(f"/v1/admin/editions/{edition['id']}").status_code == 200
    assert str(jobs_of(db, "trash_edition")[-1]["edition_id"]) == edition["id"]
    assert client.delete(f"/v1/admin/editions/{edition['id']}").status_code == 409
    # Invisible pour l'API publique
    assert client.get(f"/v1/editions/{edition['id']}").status_code == 404
    trash = client.get("/v1/admin/trash").json()
    assert edition["id"] in [t["edition_id"] for t in trash]

    r = client.post(f"/v1/admin/editions/{edition['id']}/restore")
    assert r.status_code == 200
    assert jobs_of(db, "restore_edition")
    assert client.get(f"/v1/editions/{edition['id']}").status_code == 200
    # Purge réservée à la corbeille
    assert client.post(f"/v1/admin/editions/{edition['id']}/purge").status_code == 409


def test_trash_and_restore_work(client, admin, work, db):
    n = len(
        [e for e in client.get(f"/v1/admin/works/{work['id']}").json()["editions"] if not e["deleted_at"]]
    )
    r = client.delete(f"/v1/admin/works/{work['id']}")
    assert r.status_code == 200
    assert all(e["deleted_at"] for e in r.json()["editions"])
    assert len(jobs_of(db, "trash_edition")) == n
    assert client.get(f"/v1/works/{work['id']}").status_code == 404
    r = client.post(f"/v1/admin/works/{work['id']}/restore")
    assert r.status_code == 200 and not r.json()["deleted_at"]
    assert not any(e["deleted_at"] for e in r.json()["editions"])
    assert client.get(f"/v1/works/{work['id']}").status_code == 200


def test_merge_and_move(client, admin, db):
    authors = db.execute("SELECT person_id FROM work_authors LIMIT 1").fetchone()
    a = db.execute("INSERT INTO works (slug, title) VALUES ('test/a', 'A') RETURNING id").fetchone()["id"]
    b = db.execute("INSERT INTO works (slug, title) VALUES ('test/b', 'B') RETURNING id").fetchone()["id"]
    db.execute("INSERT INTO work_authors (work_id, person_id) VALUES (%s, %s)", (a, authors["person_id"]))
    edition = db.execute(
        "INSERT INTO editions (work_id, sha256, title, language, source_file) "
        "VALUES (%s, repeat('a', 64), 'Éd. A', 'fr', 'test/a.epub') RETURNING id",
        (a,),
    ).fetchone()["id"]
    try:
        r = client.post(f"/v1/admin/editions/{edition}/move", json={"work_id": str(b)})
        assert r.status_code == 200, r.text
        assert [e["id"] for e in r.json()["editions"]] == [str(edition)]
        assert {j["params"]["work_id"] for j in jobs_of(db, "align")} == {str(a), str(b)}

        r = client.post(f"/v1/admin/works/{b}/merge", json={"into": str(a)})
        assert r.status_code == 200, r.text
        assert [e["id"] for e in r.json()["editions"]] == [str(edition)]
        assert db.execute("SELECT deleted_at FROM works WHERE id = %s", (b,)).fetchone()["deleted_at"]
        assert client.post(f"/v1/admin/works/{a}/merge", json={"into": str(a)}).status_code == 400
    finally:
        db.execute("DELETE FROM editions WHERE id = %s", (edition,))
        db.execute("DELETE FROM works WHERE id IN (%s, %s)", (a, b))


def test_structure_edit(client, admin, db):
    section = db.execute(
        """
        SELECT s.id, s.edition_id, e.revision,
               (SELECT array_agg(seq ORDER BY seq) FROM segments g WHERE g.section_id = s.id) AS seqs
        FROM sections s JOIN editions e ON e.id = s.edition_id
        WHERE s.matter = 'body' AND (SELECT count(*) FROM segments g WHERE g.section_id = s.id) >= 4
        ORDER BY e.source_file, s.seq LIMIT 1
        """
    ).fetchone()
    eid, sid = section["edition_id"], section["id"]
    structure = client.get(f"/v1/admin/editions/{eid}/structure").json()
    n_sections = len(structure["sections"])
    assert any(s["id"] == str(sid) for s in structure["sections"])

    r = client.patch(
        f"/v1/admin/editions/{eid}/sections/{sid}", json={"kind": "chapter", "title": "Chapitre test"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["revision"] == section["revision"] + 1
    assert r.json()["reprocess_pending"]
    event = db.execute("SELECT * FROM corpus_events ORDER BY id DESC LIMIT 1").fetchone()
    assert event["type"] == "edition.text_replaced" and event["data"]["reason"] == "structure"

    at = section["seqs"][2]
    r = client.post(f"/v1/admin/editions/{eid}/sections/{sid}/split", json={"at_seq": at, "title": "Suite"})
    assert r.status_code == 200, r.text
    sections = r.json()["sections"]
    assert len(sections) == n_sections + 1
    seqs = [s["seq"] for s in sections]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    new = next(s for s in sections if s["title"] == "Suite")
    assert new["seq_start"] == at
    # Un seul retraitement en file malgré plusieurs modifications
    assert len([j for j in jobs_of(db, "reprocess") if j["params"]["edition_id"] == str(eid)]) == 1

    bad = client.post(f"/v1/admin/editions/{eid}/sections/{sid}/split", json={"at_seq": section["seqs"][0]})
    assert bad.status_code == 400

    r = client.post(f"/v1/admin/editions/{eid}/sections/{sid}/merge-next")
    assert r.status_code == 200, r.text
    assert len(r.json()["sections"]) == n_sections
    assert db.execute("SELECT count(*) AS n FROM segments WHERE section_id = %s", (sid,)).fetchone()[
        "n"
    ] == len(section["seqs"])

    # Cycle refusé
    child = next((s for s in r.json()["sections"] if s["parent_id"] == str(sid)), None)
    if child:
        r = client.patch(f"/v1/admin/editions/{eid}/sections/{sid}", json={"parent_id": child["id"]})
        assert r.status_code == 400


def test_persons(client, admin, db):
    r = client.post(
        "/v1/admin/persons",
        json={"display_name": "Personne Test", "names": [{"language": "ru", "name": "Тест"}]},
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["names"] == [{"language": "ru", "name": "Тест"}]
    r = client.post("/v1/admin/persons", json={"display_name": "Doublon Test", "birth_year": 1900})
    dup = r.json()
    r = client.patch(f"/v1/admin/persons/{p['id']}", json={"death_year": 1950})
    assert r.json()["death_year"] == 1950
    found = client.get("/v1/admin/persons", params={"q": "Тест"}).json()["items"]
    assert p["id"] in [x["id"] for x in found]
    r = client.post(f"/v1/admin/persons/{dup['id']}/merge", json={"into": p["id"]})
    assert r.status_code == 200, r.text
    merged = r.json()
    assert merged["birth_year"] == 1900
    assert {"language": "und", "name": "Doublon Test"} in merged["names"]
    assert client.get(f"/v1/admin/persons/{dup['id']}").status_code == 404
    db.execute("DELETE FROM persons WHERE id = %s", (p["id"],))


def test_movements(client, admin, db):
    r = client.post("/v1/admin/movements", json={"slug": "test-courant", "labels": {"fr": "Courant test"}})
    assert r.status_code == 201, r.text
    m = next(x for x in r.json() if x["slug"] == "test-courant")
    assert m["labels"] == {"fr": "Courant test"}
    assert client.post("/v1/admin/movements", json={"slug": "test-courant"}).status_code == 409
    r = client.patch(f"/v1/admin/movements/{m['id']}", json={"labels": {"fr": "Courant", "en": "Movement"}})
    assert next(x for x in r.json() if x["id"] == m["id"])["labels"] == {"fr": "Courant", "en": "Movement"}
    r = client.delete(f"/v1/admin/movements/{m['id']}")
    assert m["id"] not in [x["id"] for x in r.json()]


def test_catalog_requires_admin(client, reviewer, work):
    assert client.patch(f"/v1/admin/works/{work['id']}", json={"title": "x"}).status_code == 403
