"""
MemReview backend — AI code review agent with Hindsight persistent memory.

Flow:
1. POST /review — user submits code
   a. recall() relevant memories from Hindsight (team standards, past feedback)
   b. Send code + memories to Groq LLM for review
   c. retain() the review in Hindsight for future learning
2. POST /feedback — user rates/corrects a review, stored as a preference memory
3. GET /memories — browse what's in memory (transparency = demo gold)
4. GET /reflect — ask Hindsight to synthesize patterns across all memories
"""

import os
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

app = FastAPI(title="MemReview API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Config ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
HINDSIGHT_URL = os.getenv("HINDSIGHT_URL", "http://localhost:8888")
HINDSIGHT_TOKEN = os.getenv("HINDSIGHT_TOKEN", "")
BANK_NAME = os.getenv("HINDSIGHT_BANK", "memreview-team")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Lazy Hindsight client — lightweight hindsight-client package
_hs_client = None


def get_hindsight():
    """Return Hindsight client, creating it on first use."""
    global _hs_client
    if _hs_client is None:
        from hindsight_client import Hindsight
        kwargs = {"base_url": HINDSIGHT_URL}
        if HINDSIGHT_TOKEN:
            kwargs["api_key"] = HINDSIGHT_TOKEN
        _hs_client = Hindsight(**kwargs)
    return _hs_client


# --- Models ---
class ReviewRequest(BaseModel):
    code: str
    language: str = "python"
    context: Optional[str] = ""  # e.g. "auth module, handles JWT"


class FeedbackRequest(BaseModel):
    review_id: str
    useful: bool
    comment: Optional[str] = ""


class ReflectRequest(BaseModel):
    question: str


# --- Prompts ---
REVIEW_SYSTEM = """You are MemReview, an expert code reviewer. Review the code below.

{memories_section}

Guidelines:
- Apply the team's remembered standards and preferences above FIRST. They override generic advice.
- Do NOT repeat suggestions the team has previously rejected.
- Be specific: cite line numbers, suggest concrete fixes.
- Prioritize: security > correctness > performance > readability > style.
- If the team has a known recurring issue relevant here, call it out explicitly.
- Format as markdown with sections: Summary, Issues (with severity), Suggestions.
- Keep it focused. No filler.
"""


@app.get("/health")
def health():
    return {
        "status": "ok",
        "groq_configured": bool(GROQ_API_KEY),
        "hindsight_url": HINDSIGHT_URL,
        "model": GROQ_MODEL,
    }


@app.post("/review")
async def review_code(req: ReviewRequest):
    if not groq_client:
        raise HTTPException(500, "GROQ_API_KEY not configured")
    if not req.code.strip():
        raise HTTPException(400, "Empty code")

    review_id = uuid.uuid4().hex[:8]

    # 1. RECALL — what does the agent remember about this team?
    memories_text = ""
    recalled = []
    try:
        hs = get_hindsight()
        results = await hs.arecall(
            bank_id=BANK_NAME,
            query=f"team coding standards, review preferences, and past feedback",
        )
        items = results if isinstance(results, list) else getattr(results, "results", []) or []
        for item in items[:8]:
            if isinstance(item, str):
                text = item
            elif hasattr(item, "text"):
                text = item.text
            elif isinstance(item, dict):
                text = item.get("content") or item.get("text") or str(item)
            else:
                text = str(item)
            recalled.append(text)
        if recalled:
            memories_text = "\n".join(f"- {m}" for m in recalled)
    except Exception as e:
        memories_text = f"(memory unavailable: {e})"

    memories_section = (
        f"TEAM MEMORY — apply these:\n{memories_text}"
        if memories_text and "unavailable" not in memories_text
        else "TEAM MEMORY: none yet — this is a first review. Give a solid general review."
    )

    # 2. REVIEW via Groq
    system = REVIEW_SYSTEM.format(memories_section=memories_section)
    user_msg = f"Language: {req.language}\nContext: {req.context or 'none'}\n\n```{req.language}\n{req.code}\n```"
    try:
        completion = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        review_text = completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")

    # 3. RETAIN — store this review so the agent learns
    try:
        hs = get_hindsight()
        await hs.aretain(retain_async=True, 
            bank_id=BANK_NAME,
            content=(
                f"Code review ({req.language}, id={review_id}):\n"
                f"Context: {req.context or 'none'}\n"
                f"Key findings: {review_text[:800]}"
            ),
        )
    except Exception:
        pass  # review still returned even if memory write fails

    return {
        "review_id": review_id,
        "review": review_text,
        "memories_used": recalled,
        "memory_count": len(recalled),
    }


@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    """Store user feedback as a preference memory — this is how the agent learns."""
    try:
        hs = get_hindsight()
        verdict = "found USEFUL" if req.useful else "REJECTED as not useful"
        await hs.aretain(retain_async=True, 
            bank_id=BANK_NAME,
            content=(
                f"Developer feedback on review {req.review_id}: {verdict}. "
                f"Comment: {req.comment or 'none'}. "
                f"{'Apply this preference in future reviews.' if req.comment else ''}"
            ),
        )
        return {"status": "recorded"}
    except Exception as e:
        raise HTTPException(502, f"Memory error: {e}")


@app.get("/memories")
async def list_memories(query: str = "", limit: int = 20):
    """Transparency endpoint — show what the agent remembers. Demo gold."""
    try:
        hs = get_hindsight()
        results = await hs.arecall(
            bank_id=BANK_NAME,
            query=query or "all team coding standards and preferences",
        )
        items = results if isinstance(results, list) else getattr(results, "results", []) or []
        out = []
        for item in items[:limit]:
            if isinstance(item, str):
                out.append({"text": item})
            elif isinstance(item, dict):
                out.append({"text": item.get("content") or item.get("text") or str(item)})
            else:
                out.append({"text": str(item)})
        return {"count": len(out), "memories": out}
    except Exception as e:
        raise HTTPException(502, f"Memory error: {e}")


@app.post("/reflect")
async def reflect(req: ReflectRequest):
    """Ask Hindsight to synthesize patterns across all memories."""
    try:
        hs = get_hindsight()
        response = await hs.areflect(bank_id=BANK_NAME, query=req.question)
        text = response if isinstance(response, str) else getattr(response, "text", str(response))
        return {"answer": text}
    except Exception as e:
        raise HTTPException(502, f"Memory error: {e}")
