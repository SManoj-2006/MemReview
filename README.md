# MemReview — AI Code Review Agent with Persistent Memory

An AI code review agent that **learns your team's standards over time** using [Hindsight](https://hindsight.vectorize.io/) memory.

## The Problem

Generic AI code reviewers give the same generic feedback to everyone. They don't know that your team:
- Cares about security more than style
- Prefers composition over inheritance
- Has been bitten by SQL injection twice this quarter

## The Solution

MemReview remembers. Every review is stored in Hindsight memory. Over time, the agent:
1. **Recalls** your team's past feedback before reviewing new code
2. **Learns** your preferences (e.g., "focus on security, skip style nits")
3. **Avoids** repeating suggestions you've already rejected
4. **Spots** recurring patterns ("3rd SQL injection this month — here's the team standard")

## Demo Story

**Review 1 (Day 1):** Generic feedback — "consider adding comments, rename variables"
**You:** "We don't care about comments. Focus on security and performance."
**Review 2 (Day 10):** Agent recalls your preference — security-focused review, no style nits
**Review 3 (Day 30):** "This is the 3rd time this auth pattern appeared. Per your team's standard..."

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   React     │────▶│   FastAPI    │────▶│    Groq     │
│  Frontend   │     │   Backend    │     │    LLM      │
└─────────────┘     └──────┬───────┘     └─────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  Hindsight   │
                   │    Memory    │
                   │ retain/recall│
                   │   /reflect   │
                   └──────────────┘
```

## Quick Start

### 1. Start Hindsight (local)

```bash
pip install hindsight-api
export HINDSIGHT_API_LLM_PROVIDER=groq
export HINDSIGHT_API_LLM_API_KEY=your-groq-key
hindsight-api
```

Or use [Hindsight Cloud](https://ui.hindsight.vectorize.io) with your API key.

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
export GROQ_API_KEY=your-groq-key
export HINDSIGHT_URL=http://localhost:8888  # or cloud URL
export HINDSIGHT_TOKEN=your-token           # cloud only
uvicorn main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## How Hindsight Memory Is Used

| Operation | When | Example |
|-----------|------|---------|
| `recall` | Before each review | "What are this team's coding standards? What feedback did they reject before?" |
| `retain` | After each review | "Team prefers security over style. Rejected comment suggestions." |
| `reflect` | On demand | "What patterns do you see in this team's code issues?" |

## Judging Criteria Mapping

- **Innovation (30%):** Memory-powered code review that adapts to each team — not a generic linter
- **Hindsight Memory (25%):** Memory is central — the before/after demo shows dramatic improvement
- **Technical (20%):** Clean FastAPI + React, handles edge cases
- **UX (15%):** Simple paste-and-review flow with visible memory timeline
- **Impact (10%):** Every dev team needs better code review

## Features (hackathon build)

- **Structured findings** — every review returns `{id, category, severity, line, message, suggestion, reason}` via Groq JSON mode (validated with Pydantic; never 500s on parse errors).
- **⚖️ Compare tab** — `POST /review/compare` runs the same code twice (generic vs with team memory); side-by-side panels highlight added team-specific findings and suppressed nits.
- **Feedback loop** — each finding has 👍 / 👎 / 🚫 "never flag this" buttons. `POST /feedback` retains structured memory (`Team REJECTED finding category=comments`, `Team will NEVER FLAG category=style`). Rejected categories are down-ranked in the prompt; never-flagged categories are hard-filtered server-side.
- **Memory provenance** — every finding carries a `reason` citing the memory that influenced it, shown as a "Why am I seeing this?" tag (🔁 badge when the pattern is recurring in team memory).
- **📖 Playbook** — `POST /playbook` uses Hindsight `reflect` to generate Team Coding Standards; download as Markdown or `.cursorrules`.
- **⏩ Demo seeding** — `POST /seed/demo` loads ~10 realistic memories ("Simulate 30 days" button); 3 ready-to-paste demo snippets in the UI.
- **📊 Dashboard** — `GET /dashboard/stats`: top recurring categories, nits suppressed, noise-reduced %, learning timeline.
- **Team switcher** — per-team memory banks (`bank` param on every endpoint); memory is isolated per team.
- **PR review** — paste a GitHub PR URL; the diff is fetched via the public GitHub API and reviewed.
- **DEMO_MODE** — `DEMO_MODE=true` (or missing Groq key / LLM timeout) returns canned structured findings so a live demo never dies.
- **Rust finding priority** — the standalone [`finding-priority` crate](rust/finding-priority/README.md) validates severity labels and stably orders findings from critical to nit.

## How Hindsight memory is used

| Operation | Where | What it does |
|---|---|---|
| `retain` | after each review | stores finding categories + context |
| `retain` | per-finding feedback | stores `ACCEPTED` / `REJECTED` / `NEVER FLAG category=X` preference memories |
| `retain` | `/seed/demo` | loads realistic team history for demos |
| `recall` | before each review | fetches team standards, preferences, past feedback; builds the prompt's memory section |
| `recall` | never-flag filter | parses `NEVER FLAG category=X` directives → hard-filtered server-side |
| `reflect` | `/reflect`, `/playbook` | synthesizes patterns ("Team Coding Standards") across all memories |

Memory is isolated per team via the `bank` parameter (Hindsight `bank_id`).

## Screenshots

_Screenshots go here — capture during the live demo:_
- `docs/review-findings.png` — Review tab with finding cards + why-tags
- `docs/compare.png` — Compare tab side-by-side diff
- `docs/dashboard.png` — Dashboard stats
- `docs/playbook.png` — Generated playbook

## Quick start

```bash
# backend
cd backend && cp .env.example .env   # fill in GROQ_API_KEY
.venv/bin/python -m uvicorn main:app --reload --port 8000

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Set `DEMO_MODE=true` in `backend/.env` for a bulletproof demo without LLM dependency.
