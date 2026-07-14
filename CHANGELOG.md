# Changelog

High-level evolution of Polity Studio — meaningful milestones only, not
a commit log. See `git log` for the full history.

## v3.1.1 — 2026-07-14

**Production stabilization pass** — no new features; every change makes
the existing workflow survive large documents, slow tablets and long
sessions. All fixes verified against 130–437-page documents in a real
Chromium, including at 4× CPU throttling (an Android-tablet proxy), and
confirmed pixel-identical to the previous release's PDF output by the
visual-regression benchmark.

- **Fixed: Pages preview hung forever after toggling a setting and
  toggling it back.** Rebuilding the paged preview with byte-identical
  HTML never reloaded the iframe (React skips identical state), so the
  "layout finished" signal never re-fired and the pane sat on "Laying
  out pages…" indefinitely — the exact repeated-setting-changes hang
  reported from production. The preview now recognizes an identical
  rebuild and restores the already-settled result instantly.
- **Fixed: multi-second UI freeze at the start of every PDF export.**
  The engine's pseudo-element materializer probed every element of
  every page with `getComputedStyle` twice, synchronously (measured:
  3.1s frozen for a 55k-element/405-page document at 4× throttle, only
  2.2% of probes hitting a real pseudo). It now enumerates the
  stylesheets' own `::before`/`::after` selectors — provably complete,
  verified element-for-element equivalent on a 405-page document — and
  yields between pages. Throttled 405-page export dropped from 180s to
  149s with a lower peak heap.
- **Halved peak memory while Publish is open.** The editor's Pages
  preview kept its own full paginated DOM alive underneath the Publish
  overlay — two copies of a 400-page layout is what pushes Android
  Chrome tabs into OOM "hangs". The preview now suspends while Publish
  is open and rebuilds on return.
- **Typesetting can no longer hang silently.** The layout stall
  watchdog previously armed only after a JS error; a silent Paged.js
  stall waited forever. It now always runs (wide ~25s no-progress
  window, tightened to ~3s after a real error), and both Publish and
  the Pages preview show a live "Typesetting pages… N" count so slow
  layout on a tablet is visibly working, not stuck.
- **Touch safety during export** — the Publish preview ignores touches
  while the engine transcribes, so an accidental pinch can't corrupt
  the measurements being read from the live layout.
- **Storage durability on tablets** — the app now requests persistent
  storage, taking Chrome's under-pressure eviction of IndexedDB (where
  every document lives) off the table.
- `npm run test:visual` now always rebuilds before benchmarking
  (`VISUAL_SKIP_BUILD=1` opts out) — it previously reused any stale
  `dist/` silently, which could validate the wrong build. Baseline
  refreshed (was stale since v3.1.0's kerning fix, as HANDOVER.md
  documented).

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

- **Regression audit** — a follow-up pass found and fixed three real
  regressions the fidelity/PWA work above introduced, all only visible
  at a scale beyond the 10-page document used to verify the original
  fixes: the kerning check compared whole-run width divergence
  regardless of run length, sending most multi-syllable words (not
  just the intended short heavily-kerned pairs) through a slower,
  more verbose per-character PDF draw path — inflating both export
  time and file size; the HTML export's counter-baking scanned every
  element on every page instead of the four known selectors that ever
  use a CSS counter, scaling with document size instead of with actual
  need; and counters silently baked nothing when a PDF was exported
  before the HTML export in the same session, because the bake ran
  against the PDF engine's own pseudo-element-disabling stylesheet.
  Also relabeled the Settings storage-usage figure — it was always
  total origin storage, not document size, but the PWA precache
  (~2.3MB) made that distinction newly significant. See
  `docs/engineering/IMPLEMENTATION_REPORT.md` for root-cause detail.

**Why.** Direct implementation of an extended improvement brief across
PYQ/MCQ workflow, cover design, document model, editor productivity,
export pipeline, offline support, and rendering fidelity, followed by
a regression audit prompted by real-usage reports of export hangs and
increased PDF size — see `docs/engineering/IMPLEMENTATION_REPORT.md`
for the complete requirement-by-requirement breakdown, including what
was intentionally deferred and why.

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
