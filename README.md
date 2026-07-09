# Polity Studio

**Polity Made Simple · A JRF Club Initiative**

A premium content-creation workspace for educators. Paste raw educational
content → organize it → beautify it → preview real pages → export
**print-ready branded PDFs** — theory notes, quick-revision sheets, MCQ
booklets and flash-card decks.

> Paste content → Preview → **Export PDF**. That's the whole workflow.

Everything runs **in the browser**: no accounts, no server, no database to
manage. Documents live in the browser's own storage (with one-tap JSON
backup/restore), and PDFs are typeset locally with real print pagination —
running headers and footers, page numbers, a contents page with live page
references, and the Polity Made Simple watermark on every page.

## Highlights

- **Four templates** — Theory Notes, Quick Revision, MCQ Booklet (with
  parsed questions, difficulty/topic/source chips, answer key and
  explanations) and Flash Cards.
- **True typeset PDFs** — Paged.js runs in your browser: covers (4 styles),
  TOC with page numbers, running chrome, clickable links, vector watermark.
  Small files, embedded fonts, print-ready.
- **Everything configurable in-app** — branding (names, links, colors,
  exams, watermark), per-document layout (cover style, TOC, watermark,
  closing page, A4/A5/Letter, text density), export filename pattern.
- **AI assistant, bring your own key** — beautify, exam notes, summaries,
  tables, MCQs, flash cards and custom instructions. Works with any
  OpenAI-compatible endpoint or the Anthropic API; streaming; the key never
  leaves your device except to the provider you configure.
- **Made for tablets** — responsive, touch-friendly, installable from the
  browser menu (Add to Home screen).

## Daily use

1. **New document** → pick a template.
2. Paste or type Markdown. The toolbar covers headings, lists, tables,
   callouts (`::: definition` … `:::`) and page breaks (`\pagebreak`).
3. Fill **Details** (exam, session, cover style, layout).
4. Toggle the preview to **Pages** to see the exact printed pages.
5. **Export PDF** → the print dialog opens → *Save as PDF*.

Work autosaves continuously. Back up from **Settings → Your data**.

## MCQ format

```
## Section A — Political Theory

Q. Who called political science "the master science"?
A) Plato
B) Aristotle *          ← trailing * marks the answer (or "Answer: B")
C) Machiavelli
D) Laski
Explanation: …
Difficulty: Easy
Topic: Greek Political Thought
Source: UGC-NET Dec 2023
```

## Development

Requires Node.js 20+.

```bash
npm install       # also copies the Paged.js runtime into public/vendor
npm run dev       # Vite dev server
npm run build     # production build → dist/
npm start         # serve dist/ (honors $PORT)
npm run typecheck
```

## Deploying on Railway

The repo ships with `railway.json` — create a Railway service from this
repository and it builds (`npm run build`) and serves (`npm start`) with no
further configuration. `PORT` is provided by Railway automatically; there
are no secrets and no volumes to configure, because all user data lives in
the browser.

Any other static-capable host (Render, Netlify, Vercel, nginx…) works the
same way: build and serve `dist/`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it's put together and how
to add templates, cover styles, AI workflows and more.

---

*Polity Made Simple — Study Smarter. Learn Faster.*
*www.politymadesimple.com · Telegram: @politicalsciencenetjrfclub*
