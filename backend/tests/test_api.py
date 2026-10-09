"""Smoke tests for the MemReview API — no network, Groq, or Hindsight needed."""

import importlib
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_app(monkeypatch, groq_key=None):
    """Import main with a controlled GROQ_API_KEY env."""
    if groq_key is None:
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
    else:
        monkeypatch.setenv("GROQ_API_KEY", groq_key)
    # The sandbox's no_proxy contains bracketed IPv6 literals that this
    # httpx version can't parse when the Groq client builds its proxy map.
    for var in ("no_proxy", "NO_PROXY", "http_proxy", "https_proxy",
                "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
        monkeypatch.delenv(var, raising=False)
    import main

    importlib.reload(main)
    return TestClient(main.app)


def test_health_returns_200(monkeypatch):
    client = load_app(monkeypatch)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["hindsight_reachable"], bool)


def test_review_without_key_returns_demo_fallback(monkeypatch):
    client = load_app(monkeypatch)  # no GROQ_API_KEY → demo-safe canned findings
    r = client.post("/review", json={"code": "print('hi')", "language": "python"})
    assert r.status_code == 200
    body = r.json()
    assert body["demo_fallback"] is True
    assert len(body["findings"]) >= 1
    f = body["findings"][0]
    for field in ("id", "category", "severity", "message", "reason"):
        assert field in f


def test_review_empty_code_returns_400(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review", json={"code": "   ", "language": "python"})
    assert r.status_code == 400


def test_review_oversized_code_returns_400(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review", json={"code": "x" * 20001, "language": "python"})
    assert r.status_code == 400
    assert "too long" in r.json()["detail"].lower()


def test_review_code_at_limit_passes_validation(monkeypatch):
    # 20000 chars should NOT trip the length check (fails later at LLM, which is fine)
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review", json={"code": "x" * 20000, "language": "python"})
    assert r.status_code != 400 or "too long" not in r.json().get("detail", "").lower()


def test_memories_without_hindsight_returns_502(monkeypatch):
    client = load_app(monkeypatch)
    r = client.get("/memories")
    assert r.status_code == 502


def test_review_returns_structured_findings_in_demo(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review", json={"code": "x = 1", "language": "python", "bank": "test-bank"})
    assert r.status_code == 200
    body = r.json()
    assert body["demo_fallback"] is True
    assert all("category" in f and "reason" in f for f in body["findings"])


def test_compare_returns_both_sides(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review/compare", json={"code": "x = 1", "language": "python"})
    assert r.status_code == 200
    body = r.json()
    assert "generic" in body and "personalized" in body
    assert len(body["generic"]) >= 1 and len(body["personalized"]) >= 1


def test_feedback_rejects_bad_verdict(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/feedback", json={"review_id": "abc", "verdict": "maybe"})
    assert r.status_code == 400


def test_feedback_legacy_boolean_form(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    import main  # patch AFTER load_app (it reloads the module)
    # stub hindsight so no network is needed
    async def fake_aretain(**kwargs):
        return None
    class FakeHS:
        aretain = staticmethod(fake_aretain)
    monkeypatch.setattr(main, "get_hindsight", lambda: FakeHS())
    r = client.post("/feedback", json={"review_id": "abc", "useful": True})
    assert r.status_code == 200
    assert r.json()["verdict"] == "accepted"


def test_never_flag_extraction():
    import main
    mems = [
        "Team will NEVER FLAG category=style. Never emit findings in this category again.",
        "Team ACCEPTED finding category=sql_injection severity=high.",
        "random note",
    ]
    assert main.extract_never_flag_categories(mems) == ["style"]


def test_never_flag_hard_filter(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    import main  # patch AFTER load_app (it reloads the module)
    monkeypatch.setenv("DEMO_MODE", "true")
    # DEMO_MODE python findings include sql_injection + error_handling;
    # inject a never_flag memory by stubbing recall
    async def fake_recall(bank, query, limit=8):
        return ["Team will NEVER FLAG category=error_handling. Never emit findings in this category again."]
    monkeypatch.setattr(main, "recall_memories", fake_recall)
    async def fake_aretain(**kwargs):
        return None
    class FakeHS:
        aretain = staticmethod(fake_aretain)
    monkeypatch.setattr(main, "get_hindsight", lambda: FakeHS())
    r = client.post("/review", json={"code": "x = 1", "language": "python", "bank": "nf-bank"})
    body = r.json()
    assert "error_handling" in body["suppressed"]
    assert all(f["category"] != "error_handling" for f in body["findings"])


def test_dashboard_stats_shape(monkeypatch):
    client = load_app(monkeypatch)
    r = client.get("/dashboard/stats?bank=empty-bank")
    # Hindsight is down in test env → recall returns [] → empty stats, not 500
    assert r.status_code == 200
    body = r.json()
    assert "top_categories" in body and "timeline" in body
    assert body["bank"] == "empty-bank"


def test_pr_url_validation(monkeypatch):
    client = load_app(monkeypatch, groq_key="test-key")
    r = client.post("/review/pr", json={"pr_url": "not a url"})
    assert r.status_code == 400
