import { useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SAMPLES = {
  python: `def login(username, password):
    query = "SELECT * FROM users WHERE name='" + username + "' AND pw='" + password + "'"
    result = db.execute(query)
    if result:
        return "ok"
    return "fail"`,
  javascript: `function getUser(id) {
  return fetch('/api/users/' + id)
    .then(r => r.json())
    .then(u => {
      document.getElementById('name').innerHTML = u.name;
      return u;
    });
}`,
  java: `public User findUser(String username) throws SQLException {
    Statement stmt = conn.createStatement();
    String sql = "SELECT * FROM users WHERE username = '" + username + "'";
    ResultSet rs = stmt.executeQuery(sql);
    if (rs.next()) {
        return new User(rs.getString("name"), rs.getString("pw"));
    }
    return null;
}`,
  go: `func getUser(db *sql.DB, id string) (*User, error) {
	query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", id)
	row := db.QueryRow(query)
	var u User
	err := row.Scan(&u.ID, &u.Name)
	return &u, err
}`,
};

function MemoryBadge({ count }) {
  if (count === 0)
    return <span className="badge badge-new">first review — no memories yet</span>;
  return <span className="badge badge-mem">🧠 {count} memories applied</span>;
}

async function parseOrThrow(r) {
  let body = null;
  try { body = await r.json(); } catch { /* non-JSON error body */ }
  if (!r.ok) throw new Error((body && body.detail) || r.statusText);
  return body;
}

export default function App() {
  const [tab, setTab] = useState("review");
  const [code, setCode] = useState(SAMPLES.python);
  const [language, setLanguage] = useState("python");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [fbComment, setFbComment] = useState("");
  const [fbDone, setFbDone] = useState(false);

  const [memories, setMemories] = useState([]);
  const [memQuery, setMemQuery] = useState("");

  const [question, setQuestion] = useState("What recurring code issues has this team had?");
  const [answer, setAnswer] = useState("");

  const doReview = async () => {
    setLoading(true); setError(""); setResult(null); setFbDone(false); setFbComment("");
    try {
      const r = await fetch(`${API}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, context }),
      });
      setResult(await parseOrThrow(r));
    } catch (e) { setError(String(e.message || e)); }
    setLoading(false);
  };

  const sendFeedback = async (useful) => {
    try {
      const r = await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: result.review_id, useful, comment: fbComment }),
      });
      await parseOrThrow(r);
      setFbDone(true);
    } catch (e) { setError(String(e.message || e)); }
  };

  const loadMemories = async () => {
    setError("");
    try {
      const r = await fetch(`${API}/memories?query=${encodeURIComponent(memQuery)}`);
      const j = await parseOrThrow(r);
      setMemories(j.memories || []);
    } catch (e) { setError(String(e.message || e)); }
  };

  const doReflect = async () => {
    setAnswer("thinking..."); setError("");
    try {
      const r = await fetch(`${API}/reflect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const j = await parseOrThrow(r);
      setAnswer(j.answer);
    } catch (e) { setAnswer(""); setError(String(e.message || e)); }
  };

  return (
    <div className="app">
      <header>
        <h1>🧠 MemReview</h1>
        <p className="sub">AI code review that <em>remembers</em> your team's standards</p>
        <nav>
          {["review", "memories", "reflect"].map(t => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "review" ? "🔍 Review" : t === "memories" ? "🧠 Memory" : "💡 Reflect"}
            </button>
          ))}
        </nav>
      </header>

      {tab === "review" && (
        <main>
          <div className="row">
            <select value={language} onChange={e => {
              setLanguage(e.target.value);
              if (SAMPLES[e.target.value]) setCode(SAMPLES[e.target.value]);
            }}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="java">Java</option>
              <option value="go">Go</option>
            </select>
            <input placeholder="Context (optional): e.g. auth module, handles JWT"
              value={context} onChange={e => setContext(e.target.value)} className="grow" />
          </div>
          <textarea value={code} onChange={e => setCode(e.target.value)}
            rows={12} spellCheck={false} className="code-input" />
          <button onClick={doReview} disabled={loading} className="primary">
            {loading ? "Reviewing with memory..." : "Review Code"}
          </button>
          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result">
              <div className="result-head">
                <MemoryBadge count={result.memory_count} />
              </div>
              {result.memories_used?.length > 0 && (
                <details className="mem-used">
                  <summary>Memories applied to this review</summary>
                  <ul>{result.memories_used.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </details>
              )}
              <div className="review-text markdown">
                <ReactMarkdown>{result.review}</ReactMarkdown>
              </div>
              {!fbDone ? (
                <div className="feedback">
                  <p>Was this review useful?</p>
                  <input placeholder="Tell the agent what to remember (optional)"
                    value={fbComment} onChange={e => setFbComment(e.target.value)} className="grow" />
                  <div className="row">
                    <button onClick={() => sendFeedback(true)}>👍 Useful</button>
                    <button onClick={() => sendFeedback(false)}>👎 Not useful</button>
                  </div>
                </div>
              ) : <p className="ok">✓ Feedback saved to memory — future reviews will adapt.</p>}
            </div>
          )}
        </main>
      )}

      {tab === "memories" && (
        <main>
          <div className="row">
            <input placeholder="Search memories..." value={memQuery}
              onChange={e => setMemQuery(e.target.value)} className="grow" />
            <button onClick={loadMemories}>Search</button>
          </div>
          <p className="hint">Everything the agent remembers about your team. This is the Hindsight memory bank.</p>
          {memories.map((m, i) => <div key={i} className="memory-card">{m.text}</div>)}
          {memories.length === 0 && <p className="hint">No memories yet — do a review first.</p>}
        </main>
      )}

      {tab === "reflect" && (
        <main>
          <input value={question} onChange={e => setQuestion(e.target.value)} className="grow" />
          <button onClick={doReflect} className="primary">Ask Memory</button>
          {error && <div className="error">{error}</div>}
          {answer && (
            <div className="review-text markdown">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          )}
          <p className="hint">Hindsight <em>reflect</em> synthesizes patterns across all stored memories.</p>
        </main>
      )}

      <footer>Built for Hack with Hyderabad 3.0 · Hindsight + Groq</footer>
    </div>
  );
}
