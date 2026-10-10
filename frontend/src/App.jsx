import { useState, useEffect } from "react";
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

const DEMO_SNIPPETS = {
  "🐍 SQL injection (python)": { language: "python", code:
`def get_user(username):
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    cur.execute(query)
    return cur.fetchone()` },
  "🌐 XSS via innerHTML (javascript)": { language: "javascript", code:
`function renderComment(c) {
  document.getElementById('feed').innerHTML = c.text;
}` },
  "✅ Clean code (contrast)": { language: "python", code:
`def get_user(user_id: int) -> dict | None:
    """Fetch a user by id using a parameterized query."""
    cur.execute("SELECT id, name FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    return dict(row) if row else None` },
};

const SEV_CLASS = {
  critical: "sev-critical",
  high: "sev-high",
  medium: "sev-medium",
  low: "sev-low",
  nit: "sev-nit",
};

async function parseOrThrow(r) {
  let body = null;
  try { body = await r.json(); } catch { /* non-JSON error body */ }
  if (!r.ok) throw new Error((body && body.detail) || r.statusText);
  return body;
}

function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}

function FindingCard({ f, bank, onFeedbackDone, toast }) {
  const [fbState, setFbState] = useState(null); // accepted | rejected | never_flag
  const [busy, setBusy] = useState(false);

  const send = async (verdict) => {
    setBusy(true);
    try {
      await parseOrThrow(await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_id: f._review_id, finding_id: f.id,
          category: f.category, severity: f.severity,
          verdict, bank,
        }),
      }));
      setFbState(verdict);
      toast(
        verdict === "never_flag"
          ? `Memorized: never flag ${f.category} again`
          : verdict === "accepted"
            ? `Feedback saved: ${f.category} accepted`
            : `Feedback saved: ${f.category} rejected`,
        "ok"
      );
      if (onFeedbackDone) onFeedbackDone(f, verdict);
    } catch (e) { toast(String(e.message || e), "err"); }
    setBusy(false);
  };

  const isGuardrail = f.reason && f.reason.startsWith("guardrail:");

  return (
    <div className={`finding-card ${isGuardrail ? "guardrail-card" : ""}`}>
      <div className="finding-head">
        <span className={`sev ${SEV_CLASS[f.severity] || "sev-medium"}`}>{f.severity}</span>
        <span className="fcat">{f.category}</span>
        {f.line != null && <span className="fline">line {f.line}</span>}
        {isGuardrail && <span className="guard-badge">🛡️ guardrail</span>}
      </div>
      <p className="fmsg">{f.message}</p>
      {f.evidence && (
        <blockquote className="fevidence" title="Literal code supporting this finding">
          <code>{f.evidence}</code>
        </blockquote>
      )}
      {f.suggestion && (
        <p className="fsugg"><strong>Fix:</strong> {f.suggestion}</p>
      )}
      {f.reason && (
        <div className={`why-tag ${/recurring/i.test(f.reason) ? "why-recurring" : ""}`} title={f.reason}>
          <span className="why-label">
            {/recurring/i.test(f.reason) ? "🔁 Why am I seeing this? (recurring)" : "Why am I seeing this?"}
          </span>{" "}
          {f.reason}
        </div>
      )}
      <div className="frow">
        <button disabled={busy || fbState} onClick={() => send("accepted")}
          className={fbState === "accepted" ? "fb-on" : ""} title="This finding was useful">
          👍 {fbState === "accepted" ? "Accepted" : "Useful"}
        </button>
        <button disabled={busy || fbState} onClick={() => send("rejected")}
          className={fbState === "rejected" ? "fb-on" : ""} title="This finding was not useful">
          👎 {fbState === "rejected" ? "Rejected" : "Not useful"}
        </button>
        <button disabled={busy || fbState} onClick={() => send("never_flag")}
          className={`never ${fbState === "never_flag" ? "fb-on" : ""}`}
          title="Never flag this category again">
          🚫 {fbState === "never_flag" ? "Never again" : "Never flag this"}
        </button>
      </div>
    </div>
  );
}

function CompareTab({ bank, toast }) {
  const [code, setCode] = useState(SAMPLES.python);
  const [language, setLanguage] = useState("python");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cmp, setCmp] = useState(null);

  const doCompare = async () => {
    setLoading(true); setError(""); setCmp(null);
    try {
      const r = await fetch(`${API}/review/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, context, bank }),
      });
      setCmp(await parseOrThrow(r));
    } catch (e) { setError(String(e.message || e)); }
    setLoading(false);
  };

  const catsOf = (fs) => new Set(fs.map(f => f.category));
  let added = [], suppressed = [];
  if (cmp) {
    const g = catsOf(cmp.generic), p = catsOf(cmp.personalized);
    added = cmp.personalized.filter(f => !g.has(f.category));
    suppressed = cmp.generic.filter(f => !p.has(f.category));
  }

  return (
    <main>
      <p className="hint">
        Same code, two reviews: a <strong>generic</strong> LLM pass with no memory vs{" "}
        <strong>MemReview</strong> with {bank}'s team memory. Watch nits disappear and
        team-specific findings appear.
      </p>
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
        <input placeholder="Context (optional)" value={context}
          onChange={e => setContext(e.target.value)} className="grow" />
      </div>
      <textarea value={code} onChange={e => setCode(e.target.value)}
        rows={10} spellCheck={false} className="code-input" />
      <button onClick={doCompare} disabled={loading} className="primary">
        {loading ? "Running both reviews…" : "⚖️ Compare: Generic vs Memory"}
      </button>
      {error && <div className="error">{error}</div>}

      {cmp && (
        <>
          <div className="result-head">
            <span className="badge">{added.length} team-specific added</span>
            <span className="badge">{suppressed.length} nits suppressed</span>
            <span className="badge badge-mem">🧠 {cmp.memory_count} memories applied</span>
            {cmp.demo_fallback && <span className="badge badge-demo">demo fallback</span>}
          </div>
          {cmp.guardrail_stats && (
            <div className="quality-panel">
              <h4>🛡️ Quality Metrics <span className="qp-sub">— guardrails verified this review</span></h4>
              <div className="qp-grid">
                <div className="qp-stat"><strong>{cmp.guardrail_stats.findings_verified ?? "—"}</strong><span>findings verified</span></div>
                <div className="qp-stat"><strong>{cmp.guardrail_stats.evidence_backed ?? "—"}</strong><span>evidence-backed</span></div>
                <div className="qp-stat"><strong>{cmp.guardrail_stats.slop_removed ?? "—"}</strong><span>slop removed</span></div>
                <div className="qp-stat"><strong>{cmp.guardrail_stats.nits_suppressed ?? "—"}</strong><span>nits suppressed</span></div>
              </div>
              {cmp.guardrail_stats.security_override_blocked?.length > 0 && (
                <p className="qp-note override-note">
                  🔒 Security override: team tried to suppress{" "}
                  <code>{cmp.guardrail_stats.security_override_blocked.join(", ")}</code>{" "}
                  — blocked. Security findings are never suppressible.
                </p>
              )}
              {cmp.guardrail_stats.injection_detected && (
                <p className="qp-note">⚠️ Prompt-injection pattern detected in input — treated as untrusted data.</p>
              )}
              {cmp.guardrail_stats.secrets_redacted?.length > 0 && (
                <p className="qp-note">🔑 Secrets redacted before review: {cmp.guardrail_stats.secrets_redacted.join(", ")}.</p>
              )}
            </div>
          )}
          <div className="compare-grid">
            <div className="compare-col generic">
              <h3>Generic AI Review</h3>
              {suppressed.length > 0 && (
                <p className="diff-note suppressed-note">
                  ↓ {suppressed.length} of these disappear with team memory
                </p>
              )}
              {cmp.generic.map(f => (
                <div key={f.id} className={`finding-card ${!catsOf(cmp.personalized).has(f.category) ? "suppressed-view" : ""}`}>
                  <div className="finding-head">
                    <span className={`sev ${SEV_CLASS[f.severity] || "sev-medium"}`}>{f.severity}</span>
                    <span className="fcat">{f.category}</span>
                    {f.line != null && <span className="fline">line {f.line}</span>}
                  </div>
                  <p className="fmsg">{f.message}</p>
                </div>
              ))}
              {cmp.generic.length === 0 && <p className="hint">No findings.</p>}
            </div>
            <div className="compare-col personal">
              <h3>MemReview (with team memory)</h3>
              {added.length > 0 && (
                <p className="diff-note added-note">
                  ↑ {added.length} team-specific findings added by memory
                </p>
              )}
              {cmp.personalized.map(f => (
                <div key={f.id} className={`finding-card ${!catsOf(cmp.generic).has(f.category) ? "added" : ""} ${f.reason?.startsWith("guardrail:") ? "guardrail-card" : ""}`}>
                  <div className="finding-head">
                    <span className={`sev ${SEV_CLASS[f.severity] || "sev-medium"}`}>{f.severity}</span>
                    <span className="fcat">{f.category}</span>
                    {f.line != null && <span className="fline">line {f.line}</span>}
                    {f.reason?.startsWith("guardrail:") && <span className="guard-badge">🛡️ guardrail</span>}
                  </div>
                  <p className="fmsg">{f.message}</p>
                  {f.evidence && (
                    <blockquote className="fevidence"><code>{f.evidence}</code></blockquote>
                  )}
                  {f.reason && (
                    <div className="why-tag"><span className="why-label">Why am I seeing this?</span> {f.reason}</div>
                  )}
                </div>
              ))}
              {cmp.personalized.length === 0 && <p className="hint">No findings.</p>}
            </div>
          </div>
          <MemoriesUsed memories={cmp.memories_used} />
        </>
      )}
    </main>
  );
}

function DashboardTab({ bank, toast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/dashboard/stats?bank=${encodeURIComponent(bank)}`);
      setStats(await parseOrThrow(r));
    } catch (e) { setError(String(e.message || e)); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [bank]);

  const maxCount = stats && stats.top_categories.length
    ? Math.max(...stats.top_categories.map(c => c.count)) : 1;

  return (
    <main>
      <h2 className="tab-title">📊 Team Dashboard</h2>
      <p className="hint">What the agent has learned about <strong>{bank}</strong>.</p>
      <div className="playbook-actions">
        <button onClick={load} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
      </div>
      {error && <div className="error">{error}</div>}
      {stats && (
        <>
          <div className="stat-cards">
            <div className="stat-card"><div className="num">{stats.reviews_run}</div><div className="lbl">reviews run</div></div>
            <div className="stat-card"><div className="num">{stats.findings_served}</div><div className="lbl">findings served</div></div>
            <div className="stat-card"><div className="num">{stats.suppressed_count}</div><div className="lbl">nits suppressed</div></div>
            <div className="stat-card"><div className="num">{stats.noise_reduced_pct}%</div><div className="lbl">noise reduced</div></div>
          </div>
          <h3>Top recurring categories</h3>
          {stats.top_categories.length === 0 && <p className="hint">No categorized memories yet.</p>}
          {stats.top_categories.map(c => (
            <div key={c.category} className="bar-row">
              <span className="bcat">{c.category}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.count / maxCount) * 100}%` }} />
              </div>
              <span>{c.count}</span>
            </div>
          ))}
          <h3>Learning timeline</h3>
          <div className="timeline">
            {stats.timeline.map((t, i) => (
              <div key={i} className="tl-item">
                <div>{t.event}</div>
                <div className="mts">{t.ts}</div>
              </div>
            ))}
            {stats.timeline.length === 0 && <p className="hint">Nothing retained yet.</p>}
          </div>
        </>
      )}
    </main>
  );
}

function PlaybookTab({ bank, toast }) {
  const [md, setMd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true); setError(""); setMd("");
    try {
      const r = await fetch(`${API}/playbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank }),
      });
      const j = await parseOrThrow(r);
      setMd(j.markdown);
    } catch (e) { setError(String(e.message || e)); }
    setLoading(false);
  };

  const download = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Downloaded ${filename}`, "ok");
  };

  const cursorrules = `# Cursor rules — generated by MemReview from ${bank}'s team memory.
# These rules encode what this team accepts, rejects, and never wants flagged.
# Regenerate any time from the MemReview Playbook tab.

${md}`;

  return (
    <main>
      <h2 className="tab-title">📖 Team Playbook</h2>
      <p className="hint">
        Hindsight <em>reflect</em> synthesizes everything {bank} remembers into
        coding standards you can check into the repo.
      </p>
      <div className="playbook-actions">
        <button onClick={generate} disabled={loading} className="primary">
          {loading ? "Synthesizing…" : "Generate Playbook"}
        </button>
        {md && (
          <>
            <button onClick={() => download(`${bank}-playbook.md`, md)}>⬇️ Markdown</button>
            <button onClick={() => download(".cursorrules", cursorrules)}>⬇️ .cursorrules</button>
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {md && (
        <div className="review-text markdown">
          <ReactMarkdown>{md}</ReactMarkdown>
        </div>
      )}
    </main>
  );
}

function MemoriesUsed({ memories }) {
  if (!memories || memories.length === 0) return null;
  return (
    <details className="mem-used">
      <summary>Memories used in this review ({memories.length})</summary>
      <ul>{memories.map((m, i) => <li key={i}>{m}</li>)}</ul>
    </details>
  );
}

export default function App() {
  const [tab, setTab] = useState("review");
  const [bank, setBank] = useState("demo-team");
  const [customBank, setCustomBank] = useState("");
  const [toasts, setToasts] = useState([]);

  const [code, setCode] = useState(SAMPLES.python);
  const [language, setLanguage] = useState("python");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [memories, setMemories] = useState([]);
  const [memQuery, setMemQuery] = useState("");
  const [memLoading, setMemLoading] = useState(false);

  const [question, setQuestion] = useState("What recurring code issues has this team had?");
  const [answer, setAnswer] = useState("");
  const [reflectLoading, setReflectLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [prLoading, setPrLoading] = useState(false);

  const toast = (msg, kind = "info") => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4000);
  };

  const doReview = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`${API}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, context, bank }),
      });
      const j = await parseOrThrow(r);
      setResult({ ...j, findings: j.findings.map(f => ({ ...f, _review_id: j.review_id })) });
      if (j.demo_fallback) toast("Demo fallback: LLM unavailable, showing canned findings", "info");
      if (j.suppressed && j.suppressed.length)
        toast(`Suppressed ${j.suppressed.length} finding(s) per team preferences: ${j.suppressed.join(", ")}`, "ok");
    } catch (e) { setError(String(e.message || e)); }
    setLoading(false);
  };

  const loadMemories = async () => {
    setError(""); setMemLoading(true);
    try {
      const r = await fetch(`${API}/memories?query=${encodeURIComponent(memQuery)}&bank=${encodeURIComponent(bank)}`);
      const j = await parseOrThrow(r);
      setMemories(j.memories || []);
    } catch (e) { setError(String(e.message || e)); }
    setMemLoading(false);
  };

  const doReflect = async () => {
    setAnswer(""); setError(""); setReflectLoading(true);
    try {
      const r = await fetch(`${API}/reflect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, bank }),
      });
      const j = await parseOrThrow(r);
      setAnswer(j.answer);
    } catch (e) { setError(String(e.message || e)); }
    setReflectLoading(false);
  };

  const doSeed = async () => {
    setSeeding(true);
    try {
      const r = await fetch(`${API}/seed/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank }),
      });
      const j = await parseOrThrow(r);
      toast(`Seeded ${j.memories_added} memories into ${j.bank} — 30 days of team history in seconds`, "ok");
    } catch (e) { toast(String(e.message || e), "err"); }
    setSeeding(false);
  };

  const loadSnippet = (name) => {
    const s = DEMO_SNIPPETS[name];
    if (!s) return;
    setLanguage(s.language);
    setCode(s.code);
    setResult(null);
    toast(`Loaded demo snippet: ${name}`, "info");
  };

  const doPrReview = async () => {
    if (!prUrl.trim()) { toast("Paste a GitHub PR URL first", "err"); return; }
    setPrLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`${API}/review/pr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_url: prUrl.trim(), bank }),
      });
      const j = await parseOrThrow(r);
      setResult({ ...j, findings: j.findings.map(f => ({ ...f, _review_id: j.review_id })) });
      if (j.demo_fallback) toast("Demo fallback: LLM unavailable, showing canned findings", "info");
    } catch (e) { setError(String(e.message || e)); }
    setPrLoading(false);
  };

  const pickBank = (b) => {
    const v = (b || "").trim();
    if (!v) return;
    setBank(v); setCustomBank("");
    setResult(null); setMemories([]); setAnswer("");
    toast(`Switched to team bank: ${v}`, "ok");
  };

  const tabs = ["review", "compare", "memories", "reflect", "playbook", "dashboard"];

  return (
    <div className="app">
      <Toasts toasts={toasts} />
      <header>
        <h1>🧠 MemReview</h1>
        <p className="sub">AI code review that <em>remembers</em> your team's standards</p>
        <div className="team-switcher">
          <label>Team:</label>
          <select value={["demo-team", "team-alpha", "team-beta"].includes(bank) ? bank : "__custom"}
            onChange={e => pickBank(e.target.value === "__custom" ? customBank : e.target.value)}>
            <option value="demo-team">demo-team</option>
            <option value="team-alpha">team-alpha</option>
            <option value="team-beta">team-beta</option>
            <option value="__custom">{bank} (custom)</option>
          </select>
          <input placeholder="new team…" value={customBank}
            onChange={e => setCustomBank(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pickBank(customBank)} />
          <button onClick={() => pickBank(customBank)}>Use</button>
        </div>
        <nav>
          {tabs.map(t => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "review" ? "🔍 Review" : t === "compare" ? "⚖️ Compare" : t === "memories" ? "🧠 Memory" : t === "playbook" ? "📖 Playbook" : t === "dashboard" ? "📊 Dashboard" : "💡 Reflect"}
            </button>
          ))}
        </nav>
      </header>

      {error && <div className="error banner">{error}</div>}

      {tab === "review" && (
        <main>
          <div className="row">
            <select value="" onChange={e => loadSnippet(e.target.value)}>
              <option value="">🎬 Demo snippets…</option>
              {Object.keys(DEMO_SNIPPETS).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={doSeed} disabled={seeding} title="Load ~10 realistic team memories">
              {seeding ? "Seeding…" : "⏩ Simulate 30 days"}
            </button>
          </div>
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
            {loading ? "Reviewing with memory…" : "Review Code"}
          </button>
          <details className="mem-used">
            <summary>…or review a GitHub PR URL</summary>
            <div className="row" style={{ marginTop: 8 }}>
              <input placeholder="https://github.com/owner/repo/pull/123"
                value={prUrl} onChange={e => setPrUrl(e.target.value)} className="grow" />
              <button onClick={doPrReview} disabled={prLoading}>
                {prLoading ? "Fetching diff…" : "Review PR"}
              </button>
            </div>
            <p className="hint">Fetches the diff via the public GitHub API (no auth; rate limits apply).</p>
          </details>

          {result && (
            <div className="result">
              <div className="result-head">
                <span className="badge badge-mem">🧠 {result.memory_count} memories applied</span>
                {result.demo_fallback && <span className="badge badge-demo">demo fallback</span>}
                <span className="badge">{result.findings.length} findings</span>
              </div>
              <MemoriesUsed memories={result.memories_used} />
              {result.findings.length === 0 && (
                <p className="hint">No findings — clean code, or everything was suppressed by team preferences.</p>
              )}
              {result.findings.map(f => (
                <FindingCard key={f.id} f={f} bank={bank} toast={toast} />
              ))}
            </div>
          )}
        </main>
      )}

      {tab === "compare" && <CompareTab key={"cmp:"+bank} bank={bank} toast={toast} />}

      {tab === "playbook" && <PlaybookTab key={"pb:"+bank} bank={bank} toast={toast} />}

      {tab === "dashboard" && <DashboardTab key={"dash:"+bank} bank={bank} toast={toast} />}

      {tab === "memories" && (
        <main>
          <div className="row">
            <input placeholder="Search memories..." value={memQuery}
              onChange={e => setMemQuery(e.target.value)} className="grow" />
            <button onClick={loadMemories} disabled={memLoading}>
              {memLoading ? "Searching…" : "Search"}
            </button>
          </div>
          <p className="hint">Everything the agent remembers about <strong>{bank}</strong>. This is the Hindsight memory bank.</p>
          {memories.map((m, i) => (
            <div key={i} className="memory-card">
              <div>{m.text}</div>
              {m.ts && <div className="mts">{m.ts}</div>}
            </div>
          ))}
          {memories.length === 0 && !memLoading && <p className="hint">No memories yet — do a review first.</p>}
        </main>
      )}

      {tab === "reflect" && (
        <main>
          <div className="row">
            <input value={question} onChange={e => setQuestion(e.target.value)} className="grow" />
            <button onClick={doReflect} disabled={reflectLoading} className="primary">
              {reflectLoading ? "Thinking…" : "Ask Memory"}
            </button>
          </div>
          {answer && (
            <div className="review-text markdown">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          )}
          <p className="hint">Hindsight <em>reflect</em> synthesizes patterns across all stored memories for <strong>{bank}</strong>.</p>
        </main>
      )}

      <footer>Built for hackathons · Hindsight + Groq · bank: {bank}</footer>
    </div>
  );
}
