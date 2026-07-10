# Polity Studio

**Polity Made Simple · A JRF Club Initiative**

A premium desktop-publishing workspace for educators. Paste Markdown
(from any tool — including external AI assistants) → refine it →
review the real pages → **download a print-quality branded PDF** —
theory notes, quick-revision sheets, MCQ booklets and flash-card decks.

> Paste Markdown → Preview → **Publish PDF**. That's the whole workflow.

Everything runs **in the browser**: no accounts, no server, no database
to manage. Documents live in the browser's own storage (with one-tap
JSON backup/restore), and PDFs are typeset locally with real print
pagination — running headers, a branded footer with clickable social
links on every page, page numbers, a contents page with live page
references, and a vector watermark. The **Download PDF** is a true file
download — no system print dialog — produced by a built-in vector PDF
engine, so files are small, open instantly and keep selectable text.

## Highlights

- **Four templates** — Theory Notes, Quick Revision, MCQ Booklet (parsed
  questions, difficulty/topic/source chips, answer key and explanations)
  and Flash Cards. Library → **Examples** opens a rich showcase of each.
- **A serious editor** — grouped formatting toolbar (headings, bold,
  italic, underline, highlight, strikethrough, super/subscript, lists,
  checklists, quotes, tables, callouts, links, code, dividers, page
  breaks), keyboard shortcuts (Ctrl+B/I/U/K), and clear-formatting.
- **A truly live preview** — edits render in place without flashing or
  losing scroll position, and the preview follows your cursor: edit
  paragraph five, see paragraph five. **Edit inline** too: tap the cover
  title, subtitle or any heading right in the preview and it writes back
  to your Markdown. A full-screen toggle turns the preview into the
  whole workspace.
- **Pages mode, tablet-ready** — the exact typeset pages with fit-width,
  fit-page, ± zoom, **pinch-to-zoom**, double-tap and reliable page
  navigation so a whole page is always in view.
- **Publish flow** — one tap typesets the real pages full-screen for a
  final review, then **Download PDF** transcribes those exact pages into
  a true vector PDF and downloads it directly (no print dialog).
  Selectable text, subset fonts, clickable links, a PDF outline, and
  files ~60% smaller than a browser "Save as PDF".
- **Everything configurable in-app** — branding (names, links, colors,
  exams, watermark), per-document layout (cover style, TOC, watermark,
  A4/A5/Letter, text density), export filename pattern.
- **Made for tablets** — responsive, touch-friendly, installable from
  the browser menu (Add to Home screen).

## Markdown support

CommonMark plus: tables, task lists, footnotes, `==highlight==`,
`++underline++`, `~~strikethrough~~`, `x^2^` superscript, `H~2~O`
subscript, callout boxes (`::: definition` … `:::` — eight types),
`\pagebreak`, and autolinked URLs. YAML front matter from external
tools is stripped automatically.

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

## Where your data lives

Documents, branding and preferences are stored in **IndexedDB inside
your browser** — never uploaded. Manage them in Settings → Your data
(usage meter, backup, restore, delete-all) or delete individual
documents from the Library. Exported PDFs are files your browser saves
to your device; the app never keeps copies.

## Development

Requires Node.js 20+.

```bash
npm install       # copies the Paged.js runtime into public/vendor and
                  # decompresses the fonts to TTF for the PDF engine
npm run dev       # Vite dev server
npm run build     # production build → dist/
npm start         # serve dist/ (honors $PORT)
npm run typecheck
```

## Deploying

The repo ships with `railway.json` — create a Railway service from this
repository and it builds (`npm run build`) and serves (`npm start`)
with no further configuration. Any other static-capable host (Render,
Netlify, Vercel, nginx…) works the same way: build and serve `dist/`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it's put together and
how to add templates, cover styles, callouts and more.

---

*Polity Made Simple — Study Smarter, Learn Faster.*
*www.politymadesimple.com · Telegram: @politicalsciencenetjrfclub*
