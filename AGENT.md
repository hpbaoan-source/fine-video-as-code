# AGENT.md — Playbook for AI Agents (Zero-Shot Video Generation)

> **Purpose:** This file allows any AI Coding Agent (Antigravity, Claude Code, Cursor, Windsurf, Copilot, etc.) to generate a complete, studio-grade MP4 video from a user's prompt **in one pass**, without needing to read the entire repository or start the Web UI.

---

## 1. Fast-Path Workflow (3 Steps Only)

When a user asks you to create a video using `fine-video-as-code`:

1. **Ensure the repository is ready (only once):**
   - If dependencies are missing, run `npm install` and ensure `edge-tts` (`pip install edge-tts`) + Playwright Chromium (`npx playwright install chromium`) are installed.
2. **Author `samples/<slug>/script.json`:**
   - Create a folder inside `samples/<slug>/` (note: `presetScript` security guard requires preset JSON files to live inside `samples/`).
   - Write `samples/<slug>/script.json` following the **Exact Schema & Rules** in Section 2 below.
3. **Render the MP4 via CLI (no Web UI needed):**
   ```bash
   node scripts/render-sample.js <slug>
   ```
   - The final video will be saved at `samples/<slug>/video.mp4`.
   - If the script is temporary/private (e.g. internal company brand), copy `samples/<slug>/video.mp4` to the user's desired destination and delete `samples/<slug>/` before committing to git.

---

## 2. Exact `script.json` Schema & Design Rules

Every `samples/<slug>/script.json` MUST conform to `ScriptSchema` (`backend/lib/schema.js`):

```json
{
  "id": "my-video-slug",
  "template": "tech-explainer",
  "language": "vi",
  "voice": "vi-VN-HoaiMyNeural",
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "brandColor": "#0EA5E9",
  "accentColor": "#10B981",
  "meta": {
    "topic": "Short Video Title",
    "description": "One-sentence summary of the video."
  },
  "scenes": [
    {
      "id": "scene-1",
      "heading": "UPPERCASE PUNCHY TITLE",
      "badge": "CATEGORY PILL",
      "subheading": "Concise 1-sentence subtitle under the heading",
      "voiceover": "Natural spoken narration for Edge-TTS (22–35 words per scene for optimal 10–14s pacing).",
      "duration_ms": 12000,
      "visual_cue": "Short caption chip describing the visual",
      "visual_cues": [{ "type": "icon", "name": "shield-check", "size": 220 }]
    }
  ]
}
```

### Top-Level Fields

- `template`: `"tech-explainer"` | `"promo"` | `"tutorial"`
- `language`: `"vi"` | `"en"`
- `voice`:
  - Vietnamese (`"vi"`): `"vi-VN-HoaiMyNeural"` (female, warm/clear) or `"vi-VN-NamMinhNeural"` (male, authoritative)
  - English (`"en"`): `"en-US-AriaNeural"`, `"en-US-GuyNeural"`, `"en-US-JennyNeural"`, `"en-US-DavisNeural"`
- `aspectRatio`: `"16:9"` (YouTube/Presentation landscape) | `"9:16"` (TikTok/Reels/Shorts vertical) | `"1:1"` | `"4:3"`
- `resolution`: `"1080p"` (default) | `"720p"` | `"1440p"`
- `brandColor` / `accentColor`: 6-digit hex `"#RRGGBB"`

---

## 3. Rich Visual Enrichments (Left Column + Right Column)

To make every scene visually compelling, combine **1 Left-Column Enrichment** (`bullets`, `metrics`, or `codeSnippet`) with **1 Right-Column Time-Driven Animated Illustration** (`flowArchitecture`, `sequenceFlow`, `hierarchyTree`, or `compareMatrix`).

### A. Left-Column Enrichments (pick 1 per scene)

1. **`metrics` (Odometer Counter Cards — up to 4 cards):**
   - **IMPORTANT:** Start `value` with a number (`"10.000.000đ"`, `"99.9%"`, `"4.8 Tỷ"`, `"10.000 Mbps"`) so the engine's **Odometer Counter** automatically rolls the number up smoothly over ~3.2 seconds!
   ```json
   "metrics": [
     { "value": "10.000.000đ", "label": "MỨC THƯỞNG / ỨNG VIÊN" },
     { "value": "99.9%", "label": "ĐỘ AN TOÀN HỆ THỐNG" }
   ]
   ```
2. **`bullets` (Staggered Spring List — 3 to 4 items, max 200 chars each):**
   ```json
   "bullets": [
     "First concise takeaway point",
     "Second concise takeaway point",
     "Third concise takeaway point"
   ]
   ```
3. **`codeSnippet` (Animated Terminal Card — lines reveal sequentially):**
   ```json
   "codeSnippet": "$ git stash push -m \"wip\"\n✓ Saved working directory\n🚀 Ready for hotfix"
   ```

### B. Right-Column Time-Driven Animated Illustrations (pick 1 per scene, vary across scenes)

When any of these 4 fields is present, the engine automatically switches the scene to a wide `split` layout (`5.2fr 6.8fr` in `16:9`, or top-bottom in `9:16`) and animates the diagram deterministically in `tickScene(el, localMs, durationMs)`:

#### 1. `flowArchitecture` (3-Column Topology + Flying Message Orbs + Filling Partition Cells)

Use for system architecture, pipelines, data streams, or input-process-output workflows:

```json
"flowArchitecture": {
  "title": "Đường hầm bảo mật HTTPS",
  "badge": "LIVE DATA FLOW",
  "sources": [
    { "icon": "💻", "label": "Trình duyệt", "sub": "Người dùng" },
    { "icon": "📱", "label": "Mobile App", "sub": "Client" }
  ],
  "center": {
    "icon": "🔒",
    "title": "TLS 1.3 Engine",
    "partitions": ["TLS", "CERT", "GCM"],
    "cells": 10,
    "sub": "Mã hóa toàn trình chống nghe lén"
  },
  "targets": [
    { "icon": "🏦", "label": "Banking API", "sub": "Server" },
    { "icon": "☁️", "label": "Cloud Data", "sub": "Origin" }
  ],
  "caption": "Mọi gói tin đi qua đường hầm TLS đều được khóa chặt"
}
```

_(Limits: `sources` max 4, `targets` max 4, `partitions` max 4, `cells` 4–16, `label` <= 40 chars)._

#### 2. `sequenceFlow` (Actor Lifelines + Progressive Directional Arrows & Packet Dots)

Use for protocol handshakes, request/response interactions, or team workflows:

```json
"sequenceFlow": {
  "title": "Quy trình Bắt tay TLS 1.3",
  "actors": [
    { "icon": "💻", "label": "Client Browser", "sub": "Trình duyệt" },
    { "icon": "🛡️", "label": "HTTPS Server", "sub": "Máy chủ đích" }
  ],
  "messages": [
    { "from": 0, "to": 1, "tag": "SYN", "label": "ClientHello + Cipher Suites", "color": "brand" },
    { "from": 1, "to": 0, "tag": "CERT", "label": "ServerHello + Chứng chỉ SSL", "color": "accent" },
    { "from": 0, "to": 1, "tag": "AES", "label": "Truyền dữ liệu mã hóa AES-256", "color": "ok" }
  ]
}
```

_(Limits: `actors` 2–3, `messages` 1–6, `color`: `"brand"` | `"accent"` | `"ok"` | `"warn"`)._

#### 3. `hierarchyTree` (Indented Tree / Commit Graph with Live Scanner Highlight)

Use for certificate chains, folder structures, org charts, or step-by-step hierarchies:

```json
"hierarchyTree": {
  "title": "Chuỗi Tín nhiệm Chứng chỉ số",
  "nodes": [
    { "level": 0, "icon": "🏛️", "label": "Root CA (DigiCert / Let's Encrypt)", "badge": "TRUSTED" },
    { "level": 1, "icon": "📜", "label": "Intermediate CA Certificate", "badge": "RSA-4096" },
    { "level": 2, "icon": "🔒", "label": "Server Certificate (domain.vn)", "highlight": true, "badge": "VERIFIED" }
  ],
  "footer": "Chữ ký số RSA/ECDSA chống làm giả chứng chỉ 100%"
}
```

_(Limits: `nodes` 2–10, `level` 0–4)._

#### 4. `compareMatrix` (Multi-Column Table with Active Row Spotlight Sweep)

Use for before/after comparisons, pros/cons, or feature summaries:

```json
"compareMatrix": {
  "title": "So sánh HTTP Thuần vs HTTPS Bảo Mật",
  "headers": ["Tiêu chí", "HTTP Thuần (Cổng 80)", "HTTPS (TLS 1.3)"],
  "rows": [
    ["Dữ liệu truyền", "Văn bản thô dễ đọc lén", "Mã hóa AES-256-GCM"],
    ["Xác thực Server", "Không có", "Chứng chỉ số SSL/CA"]
  ]
}
```

_(Limits: `headers` 2–4 columns, `rows` 1–7 rows)._

#### 5. Animated Horizontal Bar Chart (via `visual_cues`)

```json
"visual_cues": [
  {
    "type": "chart",
    "unit": "%",
    "max": 100,
    "data": { "Bảo mật CA": 100, "Khóa ECDHE": 100, "Hiệu năng TLS 1.3": 98 }
  }
]
```

---

## 4. Built-in Icon Registry (`visual_cues` fallback)

Valid icon `name` values in `illustrations/icons.js`:
`lock`, `globe`, `handshake`, `certificate`, `key`, `shield-check`, `coffee`, `desktop`, `bug`, `eye`, `rocket`, `lightbulb`, `terminal`, `git-branch`, `git-merge`, `file-text`, `git-commit`, `check`.

---

## 5. Vietnamese TTS Acronym Pronunciation (`backend/workflow/step2-tts.js`)

The TTS pipeline automatically expands common English acronyms in Vietnamese `voiceover` (`VNPT`, `VNPT-IT`, `HTTPS`, `HTTP`, `TLS`, `SSL`, `AES`, `API`, `CI/CD`, `IDE`, `PR`, `PM`, `DBA`, `JD`, `VGS`, etc.) into phonetic Vietnamese syllables so `edge-tts` pronounces them naturally while keeping the on-screen karaoke subtitle clean.

- If your script introduces a **custom domain acronym** not in the default dictionary, you may either add it to `VI_ACRONYM_MAP` in `backend/workflow/step2-tts.js` or set `"tts_voiceover"` on that scene with the phonetic spelling while keeping `"voiceover"` for the on-screen subtitle.
