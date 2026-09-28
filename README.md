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
