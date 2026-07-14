# Changelog

High-level evolution of Polity Studio — meaningful milestones only, not
a commit log. See `git log` for the full history.

## v3.1.0 — 2026-07-14

**What changed.** A large improvement pass across the whole publishing
workflow:

- **PYQ/MCQ layout** — compact single-line question header (number ·
  unit/topic · source), duplicate answer-line stripping on import, no
  artificial solution-length limit, a small ✓ on the correct option
  instead of a separate answer block, and a heuristic that hides a
  topic label when it would give away the answer.
- **Cover design** — an Ultra-Compact density tier for very large
  documents; Session and Edition split (Edition as a small corner
  badge, not competing with the title); a four-state Language badge
  (Hindi / English / Both / None); lighter, less visually dense cover
  patterns.
- **Document model simplified** — five templates consolidated to four:
  **Notes**, **Question Bank** (MCQ + PYQ unified), **Revision**
  (Quick Revision + Flash Cards unified), and a new brand-neutral
  **Universal** template. Existing documents migrate automatically
  (`lib/store.ts`'s `normalizeDoc`).
- **Editor toolbar** — every action now has a desktop tooltip and a
  touch long-press hint; a Smart Format action that normalizes messy
  pasted/AI-generated Markdown into the app's structure; a
  Replace-from-Clipboard action.
- **Three-pane workspace** — the Settings panel is now two collapsible
  sections, Cover Designer and a new PDF Designer (typography, density,
  page size, TOC, watermark, answers placement), instead of one long
  scroll.
- **Image layout controls** — an align/width popover for images dropped
  into the editor.
- **Export size** — HTML export now inlines only the font faces the
  document actually uses (script- and usage-gated), cutting typical
  export size dramatically versus shipping the full bundled font set.
- **Offline-first PWA** — a hand-rolled service worker
  (`public/sw.js`) precaches the app shell at install time, so the app
  works fully offline after a single online visit; an update banner
  offers a reload without ever swapping the running app out from under
  an in-progress edit.
- **HTML/PDF fidelity fixes** — two real bugs found and fixed while
  validating against user-supplied reference exports: (1) the
  standalone HTML export showed "Chapter 0" and "0" for every TOC page
  reference, because Paged.js resolves those counters in its own JS
  runtime and strips the native CSS once resolved — invisible in the
  live preview, broken in a reopened file; (2) the PDF's text layout
  ignored font kerning pairs (measured up to ~2.6px drift on "To" at
  44pt), most visible on headings starting with a capital "T" before a
  lowercase vowel — one of the most aggressively kerned pairs in Latin
  type, and common as the first word of a heading.
- **Permanent visual regression benchmark** — `npm run test:visual`,
  opt-in, checks PDF/HTML/live-preview page-count agreement and
  pixel-diffs the PDF engine's output against a committed baseline.

**Why.** Direct implementation of an extended improvement brief across
PYQ/MCQ workflow, cover design, document model, editor productivity,
export pipeline, offline support, and rendering fidelity — see the
session's Final Engineering Report for the complete requirement-by-
requirement breakdown, including what was intentionally deferred and
why.

**Impact.** No breaking changes for existing documents (all migrate
automatically). Meaningfully smaller HTML exports; a real, previously
undetected rendering-fidelity gap between the PDF and HTML/live-preview
paths is closed; the app is now usable with no internet connection
after first load; the PDF engine has a standing regression check for
future changes.

## v3.0.0 — 2026-07-12

**What changed.** Repository hardening pass: a unit test suite
(Vitest), GitHub Actions CI (typecheck → test → build on every push/PR),
schema-merge safety for stored documents, a React error boundary,
performance and accessibility passes, `AI_GUIDE.md`, and a general
cleanup. Also fixed a PDF-export reliability issue on very long
documents and a crash when transcribing Devanagari text (missing
`regenerator-runtime` import for fontkit's Indic shaping engine).

**Why.** Close out the prior feature-development phase with a proper
safety net (tests + CI) before continuing feature work, and fix two
export-breaking bugs found in real use.

**Impact.** Regressions in the question-bank parser, schema migration,
and document builder are now caught automatically; large documents and
Hindi/Devanagari content export reliably.

## v2.x — 2026-07-10 to 2026-07-11

**What changed.** The bulk of the original feature set: the three-pane
workspace (Settings · Editor · Live Preview), the vector PDF engine
(`pdf-lib` + `fontkit` transcription, replacing browser print-to-PDF),
smart Markdown import (Word/Google Docs/AI-chat paste → clean
Markdown), universal search, a Command Palette, the PYQ template, the
Custom Cover Designer, a dark reading theme, and the snapshot-based
standalone HTML export. An optional external "Polity AI Engine"
integration for scanned/image import was added, then removed in favor
of staying fully client-side and offline.

**Why.** Build out the core "Markdown in, branded PDF out" workflow
this app exists for.

**Impact.** Established the architecture everything since builds on —
see `ARCHITECTURE.md` § design decisions.

## v1.0.0 — 2026-07-09

**What changed.** Ground-up rebuild of Polity Studio as a client-only,
Markdown-first publishing app: no backend, IndexedDB storage, PDF
export via the browser's print pipeline initially.

**Why.** Replace an earlier version of the tool with an architecture
that could stay lightweight and fully offline-capable long-term.

**Impact.** The foundation — document model, editor, preview — that
the vector PDF engine and every later feature was built on.
