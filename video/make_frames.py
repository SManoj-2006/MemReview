#!/usr/bin/env python3
"""Generate 1080p video frames for MemReview walkthrough."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1920, 1080
OUT = os.path.expanduser("~/workspace/memreview/video/frames")

BG = (15, 23, 42)        # slate-900
CARD = (30, 41, 59)      # slate-800
ACCENT = (56, 189, 248)  # sky-400
GREEN = (52, 211, 153)   # emerald-400
TEXT = (226, 232, 240)   # slate-200
DIM = (148, 163, 184)    # slate-400
CODE_BG = (2, 6, 23)     # slate-950

def font(size, bold=False):
    for p in [
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/TTF/DejaVuSans{'-Bold' if bold else ''}.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def mono(size):
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def base():
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)

def title_card(num, title, subtitle):
    img, d = base()
    f1, f2, f3 = font(110, True), font(52), font(36)
    d.text((W//2, H//2 - 80), title, font=f1, fill=TEXT, anchor="mm")
    d.text((W//2, H//2 + 40), subtitle, font=f2, fill=ACCENT, anchor="mm")
    d.text((W//2, H - 80), "MemReview — AI code review with persistent memory",
           font=f3, fill=DIM, anchor="mm")
    img.save(f"{OUT}/{num}_title.png")

def code_card(num, header, code_lines, footer, badge=None):
    img, d = base()
    fh, fm, ff = font(48, True), mono(34), font(36)
    d.text((W//2, 90), header, font=fh, fill=TEXT, anchor="mm")
    if badge:
        fb = font(32, True)
        bb = d.textbbox((0, 0), badge, font=fb)
        bw, bh = bb[2] - bb[0] + 50, bb[3] - bb[1] + 28
        d.rounded_rectangle([W//2 - bw//2, 150, W//2 + bw//2, 150 + bh], 20, fill=(30, 58, 95))
        d.text((W//2, 150 + bh//2), badge, font=fb, fill=ACCENT, anchor="mm")
        y = 150 + bh + 40
    else:
        y = 190
    # code block
    pad = 60
    block_h = len(code_lines) * 48 + 60
    d.rounded_rectangle([pad, y, W - pad, y + block_h], 16, fill=CODE_BG,
                        outline=(51, 65, 85), width=2)
    y += 40
    for line in code_lines:
        d.text((pad + 40, y), line, font=fm, fill=TEXT)
        y += 48
    y += 40
    # footer (wrapped)
    words, lines, cur = footer.split(), [], ""
    for w_ in words:
        if d.textlength(cur + " " + w_, font=ff) < W - 300:
            cur = (cur + " " + w_).strip()
        else:
            lines.append(cur); cur = w_
    lines.append(cur)
    for line in lines:
        d.text((W//2, y), line, font=ff, fill=DIM, anchor="mm")
        y += 52
    img.save(f"{OUT}/{num}_code.png")

def bullet_card(num, header, bullets, footer=""):
    img, d = base()
    fh, fb, ff = font(56, True), font(40), font(36)
    d.text((W//2, 110), header, font=fh, fill=TEXT, anchor="mm")
    y = 230
    for b in bullets:
        # wrap
        words, lines, cur = b.split(), [], ""
        for w_ in words:
            if d.textlength(cur + " " + w_, font=fb) < W - 400:
                cur = (cur + " " + w_).strip()
            else:
                lines.append(cur); cur = w_
        lines.append(cur)
        d.text((200, y), "▸", font=fb, fill=ACCENT)
        for i, line in enumerate(lines):
            d.text((260, y + i * 58), line, font=fb,
                   fill=TEXT if i == 0 else DIM)
        y += len(lines) * 58 + 36
    if footer:
        d.text((W//2, H - 100), footer, font=ff, fill=DIM, anchor="mm")
    img.save(f"{OUT}/{num}_bullets.png")

# --- Frames ---
title_card("01", "🧠 MemReview",
           "A code review agent that remembers your team's standards")

code_card("02", "The problem: stateless reviewers",
    [
        "def login(username, password):",
        '    query = "SELECT * FROM users WHERE name=\'" + username + "\'"',
        "    result = db.execute(query)",
    ],
    "First review — zero memories. A decent generic review, but it knows nothing about YOUR team.",
    badge="🧠 0 memories — first review")

bullet_card("03", "Teach it once",
    [
        'Feedback: "We do not care about code style. Focus ONLY on security."',
        "Hindsight extracts: \"the team prefers security over style\"",
        "Stored as a structured fact — not just a chat log",
    ],
    "retain() → memory bank → extracted facts")

code_card("04", "The payoff: same reviewer, different brain",
    [
        "function getUser(id) {",
        "  return fetch('/api/users/' + id)",
        "    .then(r => r.json())",
        "    .then(u => {",
        "      document.getElementById('name').innerHTML = u.name;",
        "    });",
        "}",
    ],
    "The review leads with the XSS vulnerability and skips every style nitpick it would normally include.",
    badge="🧠 8 memories applied")

bullet_card("05", "How it works",
    [
        "RECALL — pull team standards before every review",
        "REVIEW — Groq LLM with memories in the system prompt",
        "RETAIN — store the review for future learning",
        "FEEDBACK — corrections become preference memories",
        "REFLECT — synthesize patterns across all memories",
    ],
    "FastAPI + Groq + Hindsight  •  retain / recall / reflect")

bullet_card("06", "Takeaway",
    [
        "Zero time on prompt engineering",
        "All quality came from the memory loop",
        "Tell it once — it applies it forever",
    ],
    "github.com/SManoj-2006/MemReview")

print("frames done:", len(os.listdir(OUT)))
