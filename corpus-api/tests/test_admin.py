"""API d'administration (/v1/admin) sur la copie jetable de la base."""

from __future__ import annotations

import pytest
from psycopg.types.json import Jsonb


@pytest.fixture(scope="module")
def edition(db):
    row = db.execute("SELECT e.id, e.work_id FROM editions e ORDER BY e.source_file LIMIT 1").fetchone()
    db.execute(
        """
        INSERT INTO edition_quality (edition_id, metrics, signals, score, computed_at, structure_method)
        VALUES (%s, %s, %s, %s, now(), 'headings')
        ON CONFLICT (edition_id) DO UPDATE SET metrics = EXCLUDED.metrics, signals = EXCLUDED.signals,
            score = EXCLUDED.score
        """,
        (
            row["id"],
            Jsonb({"signal_details": {"no_toc": "sections déduites des titres"}, "n_segments": 10}),
            ["no_toc"],
            90,
        ),
    )
    return row


def test_admin_requires_role(client, reader):
    r = client.get("/v1/admin/overview")
    assert r.status_code == 403


def test_overview(client, admin, edition):
    r = client.get("/v1/admin/overview")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["postgres"]["status"] == "ok"
    assert body["postgres"]["migrations_applied"] >= 15
    assert body["funnel"]["editions"] >= 1
    assert body["funnel"]["extracted"] <= body["funnel"]["editions"]
    assert any(s["key"] == "no_toc" for s in body["quality_signals"])
    assert {lang["language"] for lang in body["languages"]}


def test_job_lifecycle(client, admin, edition, db):
    r = client.post("/v1/admin/jobs", json={"kind": "quality", "params": {"edition_id": str(edition["id"])}})
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "queued" and job["edition_id"] == str(edition["id"])
    assert job["params"]["actor"] == "test-user"

    listed = client.get("/v1/admin/jobs", params={"status": "queued", "kind": "quality"}).json()
    assert job["id"] in [j["id"] for j in listed["items"]]

    cancelled = client.post(f"/v1/admin/jobs/{job['id']}/cancel").json()
    assert cancelled["status"] == "cancelled" and cancelled["cancel_requested"]

    retried = client.post(f"/v1/admin/jobs/{job['id']}/retry").json()
    assert retried["status"] == "queued" and not retried["cancel_requested"]

    # Une tâche en file ne se relance pas
    assert client.post(f"/v1/admin/jobs/{job['id']}/retry").status_code == 409
    db.execute("DELETE FROM jobs WHERE id = %s", (job["id"],))


def test_job_params_checked(client, admin):
    r = client.post("/v1/admin/jobs", json={"kind": "align", "params": {}})
    assert r.status_code == 400


def test_jobs_pagination(client, admin, db):
    ids = [
        db.execute(
            "INSERT INTO jobs (kind, title, status) VALUES ('quality', %s, 'succeeded') RETURNING id",
            (f"t{i}",),
        ).fetchone()["id"]
        for i in range(5)
    ]
    first = client.get("/v1/admin/jobs", params={"limit": 2}).json()
    assert len(first["items"]) == 2 and first["next_cursor"]
    second = client.get("/v1/admin/jobs", params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert not {j["id"] for j in first["items"]} & {j["id"] for j in second["items"]}
    db.execute("DELETE FROM jobs WHERE id = ANY(%s)", (ids,))


def test_quality_and_acks(client, admin, edition, db):
    rows = client.get("/v1/admin/quality", params={"signal": "no_toc"}).json()["items"]
    row = next(r for r in rows if r["edition_id"] == str(edition["id"]))
    assert row["signal_details"]["no_toc"]
    assert "signal_details" not in row["metrics"]

    r = client.post(f"/v1/admin/quality/{edition['id']}/acks", json={"signal": "no_toc", "comment": "voulu"})
    assert r.status_code == 204
    rows = client.get("/v1/admin/quality", params={"signal": "no_toc"}).json()["items"]
    assert str(edition["id"]) not in [r["edition_id"] for r in rows]
    rows = client.get("/v1/admin/quality", params={"signal": "no_toc", "include_acked": True}).json()["items"]
    assert next(r for r in rows if r["edition_id"] == str(edition["id"]))["acked"] == ["no_toc"]
    # Le score est recalculé par le worker
    assert db.execute(
        "SELECT 1 FROM jobs WHERE kind = 'quality' AND edition_id = %s AND status = 'queued'",
        (edition["id"],),
    ).fetchone()

    signals = {s["code"]: s for s in client.get("/v1/admin/quality/signals").json()}
    assert signals["no_toc"]["acked"] >= 1

    assert client.delete(f"/v1/admin/quality/{edition['id']}/acks/no_toc").status_code == 204
    db.execute("DELETE FROM jobs WHERE kind = 'quality' AND edition_id = %s", (edition["id"],))


def test_quality_hides_trashed(client, admin, edition, db):
    db.execute("UPDATE editions SET deleted_at = now() WHERE id = %s", (edition["id"],))
    try:
        ids = [
            r["edition_id"] for r in client.get("/v1/admin/quality", params={"limit": 500}).json()["items"]
        ]
        assert str(edition["id"]) not in ids
        trashed = client.get("/v1/admin/quality", params={"trashed": True}).json()["items"]
        assert str(edition["id"]) in [r["edition_id"] for r in trashed]
    finally:
        db.execute("UPDATE editions SET deleted_at = NULL WHERE id = %s", (edition["id"],))


def test_consistency_and_indexes(client, admin):
    indexes = client.get("/v1/admin/indexes").json()
    assert indexes and {"collection", "pending", "points"} <= set(indexes[0])
    r = client.get("/v1/admin/consistency", params={"only_problems": False, "limit": 3})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["checked"] == 3 and len(body["rows"]) == 3


def test_events(client, admin, db):
    db.execute("SELECT corpus_emit('work.updated', NULL, NULL, '{}'::jsonb, 'quelqu-un')")
    items = client.get("/v1/admin/events", params={"actor": "quelqu-un"}).json()["items"]
    assert items and items[0]["type"] == "work.updated"
