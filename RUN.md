# Run MemReview locally

## 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```
GROQ_API_KEY=gsk_your_key_here
HINDSIGHT_URL=https://api.hindsight.vectorize.io
HINDSIGHT_TOKEN=hsk_your_key_here
```

```bash
uvicorn main:app --port 8000
```

## 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Demo flow (3 min)

1. **Review tab** — paste the Python SQL-injection example, hit Review. Generic review, "0 memories used."
2. **Feedback** — mark "not useful", write: "We don't care about style. Focus ONLY on security."
3. **Review tab** — paste the JavaScript XSS example, hit Review. Now shows "8 memories used" and the review focuses on security.
4. **Memory tab** — search "security", see stored preferences.
5. **Reflect tab** — ask "what are our recurring issues?" to see Hindsight synthesize patterns.
