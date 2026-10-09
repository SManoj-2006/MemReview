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


def test_review_without_key_returns_500(monkeypatch):
    client = load_app(monkeypatch)  # no GROQ_API_KEY
    r = client.post("/review", json={"code": "print('hi')", "language": "python"})
    assert r.status_code == 500
    assert "GROQ_API_KEY" in r.json()["detail"]


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
