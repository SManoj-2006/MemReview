# MemReview — Demo Script (3 minutes)

## Setup (before demo)
1. Hindsight running: `hindsight-api` (local) or Cloud URL in `.env`
2. Backend: `cd backend && .venv/bin/uvicorn main:app --port 8000`
3. Frontend: `cd frontend && npm run dev`
4. Groq API key in `backend/.env`

## The Story: "From Generic to Genius in 3 Reviews"

### Act 1: The Problem (30s)
> "Every AI code reviewer gives the same generic feedback. They don't know YOUR team.
> Watch what happens when the reviewer actually REMEMBERS."

**Do:** Paste the Python SQL injection sample → Click "Review Code"
**Show:** Generic review — mentions SQL injection but also style nits, comments, etc.
**Point to:** The badge says "first review — no memories yet"

### Act 2: Teach It (45s)
> "Now I'll teach it what my team actually cares about."

**Do:** Click 👎 "Not useful" → Type: "We don't care about comments or style. Focus only on security vulnerabilities."
**Show:** "✓ Feedback saved to memory"
**Do:** Go to 🧠 Memory tab → Search → Show the new preference memory
**Say:** "This is stored in Hindsight. It persists. It compounds."

### Act 3: The Payoff (45s)
> "Now watch the SAME agent review NEW code."

**Do:** Paste the JavaScript XSS sample → Click "Review Code"
**Show:** 
- Badge now says "🧠 N memories applied"
- Expand "Memories applied" — shows the security preference
- Review is security-focused, NO style nits
**Say:** "It remembered. It adapted. That's not a chatbot — that's a teammate."

### Act 4: The Insight (30s)
> "And it gets better. It can spot patterns across your whole team."

**Do:** Go to 💡 Reflect tab → Ask: "What recurring issues has this team had?"
**Show:** Hindsight synthesizes: "SQL injection (2x), XSS (1x) — team has a pattern of injection vulnerabilities"
**Say:** "That's organizational learning. No human had to write a wiki page."

### Close (15s)
> "MemReview: code review that remembers. Built with Hindsight + Groq for Hack with Hyderabad 3.0."

## Backup Lines (if something breaks)
- "Memory is the moat — generic AI forgets, MemReview learns."
- "25% of the judging is memory. We made it 100% of the demo."
