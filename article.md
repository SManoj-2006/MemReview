# How I made code reviews stick using agent memory

Every code review tool I've ever used has the memory of a goldfish. It reads your pull request, gives you feedback, and then forgets you exist. Next week it tells you the exact same thing you already told it to stop saying. I got tired of repeating myself, so I built a reviewer that remembers.

## The problem with stateless reviewers

Here's a scenario every team knows. You tell a reviewer — human or AI — "we don't care about import ordering, focus on logic bugs." Two sprints later, it's flagging import ordering again. The knowledge existed for exactly one conversation and then evaporated.

LLM-based reviewers are worse in a specific way: they're *confidently* generic. They'll give you a perfectly reasonable review that has nothing to do with how your team actually works. Your team has unwritten rules — "we always validate at the boundary," "never use raw SQL," "skip the style nits, we have a formatter" — and a stateless reviewer will never learn any of them.

I wanted a reviewer with a simple property: **tell it something once, and it applies it forever.**

## What I built

MemReview is a code review agent with persistent memory. The stack is deliberately boring: a FastAPI backend, a React frontend, Groq for the LLM calls, and [Hindsight](https://github.com/vectorize-io/hindsight) for memory. Hindsight is an open-source agent memory layer — it handles the hard parts of remembering things: storing observations, extracting facts, semantic recall, and synthesizing patterns across everything it has seen. If you want the full picture of what agent memory means as a concept, the [Vectorize agent memory](https://vectorize.io/what-is-agent-memory) page is a good starting point.

The whole system is a loop with four steps:

1. **Recall** — before reviewing, pull relevant memories about this team's standards and past feedback
2. **Review** — send the code plus the recalled memories to the LLM
3. **Retain** — store the review itself as a memory for future learning
4. **Feedback** — the developer rates the review, and that feedback becomes a preference memory

Here's the core of it, the `/review` endpoint:

```python
@app.post("/review")
async def review_code(req: ReviewRequest):
    review_id = uuid.uuid4().hex[:8]

    # 1. RECALL — what does the agent remember about this team?
    hs = get_hindsight()
    results = await hs.arecall(
        bank_id=BANK_NAME,
        query="team coding standards, review preferences, and past feedback",
    )
    recalled = [extract_text(item) for item in results.results[:8]]

    memories_section = (
        f"TEAM MEMORY — apply these:\n" + "\n".join(f"- {m}" for m in recalled)
        if recalled else
        "TEAM MEMORY: none yet — this is a first review. Give a solid general review."
    )

    # 2. REVIEW via Groq, with memories injected into the system prompt
    system = REVIEW_SYSTEM.format(memories_section=memories_section)
    review_text = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"Language: {req.language}\n```{req.language}\n{req.code}\n```"},
        ],
        temperature=0.3,
    ).choices[0].message.content

    # 3. RETAIN — store this review so the agent learns
    await hs.aretain(
        retain_async=True,
        bank_id=BANK_NAME,
        content=f"Code review ({req.language}, id={review_id}): {review_text[:800]}",
    )

    return {"review_id": review_id, "review": review_text,
            "memories_used": recalled, "memory_count": len(recalled)}
```

The system prompt is where the memory actually bites. It's not subtle about it:

```
You are MemReview, an expert code reviewer.

{memories_section}

Guidelines:
- Apply the team's remembered standards and preferences above FIRST.
  They override generic advice.
- Do NOT repeat suggestions the team has previously rejected.
```

And the feedback endpoint — the one that makes the whole thing learn — is almost embarrassingly simple:

```python
@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    verdict = "found USEFUL" if req.useful else "REJECTED as not useful"
    await hs.aretain(
        retain_async=True,
        bank_id=BANK_NAME,
        content=f"Developer feedback on review {req.review_id}: {verdict}. "
                f"Comment: {req.comment}. Apply this preference in future reviews.",
    )
    return {"status": "recorded"}
```

That's the whole learning mechanism. No fine-tuning, no retraining, no vector database to manage. You tell it what you want in plain English, Hindsight stores it, and the next review recalls it.

## The moment it clicked

I tested it with a deliberately vulnerable Python login function — string-concatenated SQL, the classic. First review, zero memories: a solid generic review covering SQL injection, plaintext passwords, the works. Fine.

Then I gave it feedback: marked the review "not useful" with the comment *"We do not care about code style or comments. Focus ONLY on security vulnerabilities."*

Then I submitted a JavaScript snippet with an XSS vulnerability via `innerHTML`.

The second review came back with **8 memories applied**. And here's the part that got me: I checked what Hindsight had actually stored, and it wasn't just my raw comment. It had extracted structured facts:

- *"The team prefers security over style."* (observation)
- *"User prefers code reviews to focus exclusively on security vulnerabilities, ignoring code style and comments."* (world fact, timestamped)

I never wrote those sentences. I wrote a frustrated comment, and the memory layer distilled it into reusable knowledge. That's the difference between a chat log and a memory system — a chat log stores what you said, a memory system stores what you *meant*.

The review itself adapted accordingly. It led with the XSS vulnerability, stayed focused on security issues, and skipped the style commentary it would otherwise have included.

## What I got wrong along the way

**Deadlocking the event loop.** The Hindsight Python client ships both sync and async methods. I called the sync `retain()` from inside a FastAPI async endpoint, and the whole thing hung with `this event loop is already running` — the sync wrapper tries to spin up its own event loop. The fix was switching every call to the `a`-prefixed async variants (`aretain`, `arecall`, `areflect`). If you're mixing any memory SDK with an async web framework, go async from the start.

**Blocking retains.** Even with the async client, `aretain()` with default arguments waits for server-side processing — fact extraction, entity resolution — before returning. Against a cloud API, that wait timed out. Setting `retain_async=True` makes the store fire-and-forget: the memory lands immediately and gets processed in the background. For a review tool where latency matters, this was non-negotiable.

**Parsing recall results.** The client's `arecall` returns `RecallResult` objects, not dicts. My first parsing pass called `.get("text")` on them and silently produced zero memories — the review *looked* fine, it just wasn't using any memory. The scariest bugs are the ones where the feature appears to work. I only caught it because I asserted on `memory_count` in testing.

**Model names rot.** I started with `qwen/qwen3-32b` from a recommendation doc. It didn't exist. Neither did my fallback, `llama-3.3-70b-versatile`. I ended up querying the provider's `/models` endpoint to see what my key could actually access, and landed on `openai/gpt-oss-120b`. Lesson: never hardcode a model name from a doc — list what's available at runtime or at least fail loudly.

## What I'd tell someone building this

**Memory makes your prompts smaller, not bigger.** The naive approach to "teach the reviewer our standards" is stuffing a 50-page style guide into every prompt. With recall, you inject 8 relevant facts instead. It's cheaper, it's more focused, and it actually works better because the model isn't drowning in irrelevant context.

**The feedback endpoint is the product.** The review endpoint is table stakes — any LLM wrapper can do that. What makes the agent *yours* is the mechanism for correcting it. If I were rebuilding, I'd put the feedback UX front and center instead of treating it as a secondary tab.

**Show the memory.** I added a `GET /memories` endpoint mostly for debugging, and it turned out to be the most compelling part of the demo. When users can *see* what the agent remembers — "the team prefers security over style" sitting right there in a list — they trust it. Black-box memory feels creepy; transparent memory feels like a colleague's notebook.

**Design for memory being down.** Every Hindsight call in the review path is wrapped so the review still returns if memory is unavailable. The response just says "first review — no memories yet." An agent that breaks when its memory is unreachable is worse than a stateless one.

**Start with the loop, not the model.** I spent zero time on prompt engineering and most of my time on the recall → review → retain → feedback cycle. The quality of the memory loop determined the quality of the product far more than which model I used or how clever the system prompt was.

## Where this goes

Right now MemReview is a single-team tool with one memory bank. The obvious next step is per-repository banks — the agent remembers different standards for the payments service versus the marketing site. After that: Hindsight's `reflect` can already synthesize patterns across all memories ("what are this team's recurring issues?"), which turns the reviewer into something closer to a staff engineer who notices that three teams keep writing the same SQL injection.

The deeper point is simpler. Agents without memory are amnesiacs — smart, articulate, and doomed to repeat every conversation. Giving them a memory layer like [Hindsight](https://github.com/vectorize-io/hindsight) doesn't just make them more useful, it changes the relationship: you stop *prompting* a tool and start *teaching* a colleague. The [Hindsight docs](https://hindsight.vectorize.io/) cover the retain/recall/reflect primitives; the rest is just deciding what you want your agent to remember.

My reviewer remembers that we care about security, not style. What would you teach yours?
