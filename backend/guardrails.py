"""Guardrails for MemReview: anti-slop + safety validation for LLM output.

Every finding the LLM produces is treated as untrusted until it passes:
  1. Line verification — line numbers must exist in the submitted code.
  2. Slop filter — vague, duplicate, or filler findings are dropped.
  3. Safe suppression — NEVER FLAG only applies to cosmetic categories;
     security/correctness findings can never be suppressed by team preference.
  4. Prompt-injection defense — submitted code is untrusted data.
  5. Secret scanning — API keys/secrets in input are redacted before
     reaching the LLM or Hindsight memory.
"""
import hashlib
import re
from typing import List, Optional, Set

from pydantic import BaseModel


# --- Category policy ---
# Only cosmetic categories may be fully suppressed via NEVER FLAG.
# Security and correctness findings are mandatory regardless of team preference.
SUPPRESSIBLE = {"style", "comments"}

SECURITY_CATEGORIES = {
    "sql_injection", "xss", "hardcoded_secret", "auth",
    "injection", "security",
}

KNOWN_CATEGORIES = {
    "sql_injection", "xss", "hardcoded_secret", "auth", "injection",
    "security", "error_handling", "correctness", "performance",
    "reliability", "maintainability", "composition", "best_practice",
    "complexity", "style", "comments", "testing", "general",
}


class GuardedFinding(BaseModel):
    """Validated finding shape. Extra fields from the LLM are ignored."""
    id: str
    category: str
    severity: str = "medium"  # critical | high | medium | low | nit
    line: Optional[int] = None
    message: str
    suggestion: str = ""
    reason: str = ""
    evidence: str = ""  # literal code quote supporting the finding


# --- Prompt injection defense ---
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"ignore\s+the\s+above",
    r"disregard\s+(all\s+)?(previous|above)",
    r"system\s*:",
    r"\[system\]",
    r"you\s+are\s+now\s+",
    r"new\s+instructions\s*:",
    r"override\s+.*instructions",
]


def detect_prompt_injection(code: str) -> List[str]:
    """Return matched injection patterns in the submitted code."""
    return [p for p in _INJECTION_PATTERNS if re.search(p, code, re.IGNORECASE)]


# --- Secret scanning ---
_SECRET_PATTERNS = [
    (r"sk-[A-Za-z0-9]{20,}", "openai_key"),
    (r"gsk_[A-Za-z0-9]{20,}", "groq_key"),
    (r"AKIA[0-9A-Z]{16}", "aws_key"),
    (r"ghp_[A-Za-z0-9]{20,}", "github_token"),
    (r"xox[baprs]-[A-Za-z0-9-]{10,}", "slack_token"),
    (r"(?i)(api[_-]?key|secret|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]", "credential"),
]


def scan_secrets(code: str) -> List[str]:
    """Return names of secret types detected in the input. Never logs values."""
    return [name for pat, name in _SECRET_PATTERNS if re.search(pat, code)]


def redact_secrets(code: str) -> str:
    """Replace detected secret values with [REDACTED] before LLM/memory."""
    redacted = code
    for pat, _ in _SECRET_PATTERNS:
        redacted = re.sub(pat, "[REDACTED]", redacted)
    return redacted


# --- Output validation ---
def verify_lines(findings: List[GuardedFinding], code: str) -> List[GuardedFinding]:
    """Null out line numbers that don't exist in the submitted code."""
    total = code.count("\n") + 1
    for f in findings:
        if f.line is not None and not (1 <= f.line <= total):
            f.line = None
    return findings


_VAGUE_PHRASES = {
    "consider improving", "could be better", "might be improved",
    "looks good", "nice code", "well done", "lgtm",
}


def _fingerprint(f: GuardedFinding) -> str:
    norm = " ".join(f.message.lower().split())
    return hashlib.md5(f"{f.category}:{norm[:80]}".encode()).hexdigest()


def filter_slop(findings: List[GuardedFinding]) -> List[GuardedFinding]:
    """Drop vague, filler, and duplicate findings; normalize categories."""
    kept: List[GuardedFinding] = []
    seen: Set[str] = set()
    for f in findings:
        msg = (f.message or "").strip()
        if len(msg) < 15:
            continue
        if msg.lower() in _VAGUE_PHRASES:
            continue
        fp = _fingerprint(f)
        if fp in seen:
            continue
        seen.add(fp)
        if f.category.lower() not in KNOWN_CATEGORIES:
            f.category = "general"
        kept.append(f)
    return kept


def safe_suppress(
    findings: List[GuardedFinding], never_flag: List[str]
) -> tuple[List[GuardedFinding], List[str], List[str]]:
    """Apply NEVER FLAG only to suppressible (cosmetic) categories.

    Returns (kept, suppressed, blocked) where blocked lists categories
    the team tried to suppress but which are security-mandatory.
    """
    nf = {c.lower() for c in never_flag}
    kept, suppressed, blocked = [], [], []
    for f in findings:
        cat = f.category.lower()
        if cat in nf:
            if cat in SUPPRESSIBLE:
                suppressed.append(cat)
            else:
                blocked.append(cat)  # security override: cannot suppress
                kept.append(f)
        else:
            kept.append(f)
    return kept, suppressed, blocked


def validate_evidence(
    findings: List[GuardedFinding], code: str
) -> List[GuardedFinding]:
    """Keep evidence quotes only if they appear (fuzzily) in the source."""
    for f in findings:
        ev = (f.evidence or "").strip()
        if ev and ev[:40].lower() not in code.lower():
            f.evidence = ""  # unsupported quote → drop, keep finding
    return findings
