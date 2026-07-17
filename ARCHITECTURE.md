# Polity Studio — Architecture

This document describes the code that is actually in this repository,
and how to extend it.

## Design decisions

1. **Client-only static app.** The entire product — editing, storage,
   pagination, PDF export — runs in the browser. There is no server, no
   database, no auth surface, nothing to patch or migrate. Deployment is
   "serve a folder", which any host does reliably.
2. **Paged.js typesets; a custom engine writes the PDF.** Paged.js runs
   in a same-origin iframe and produces the exact paginated DOM —
   running headers/footers (`position: running()`), `counter(pages)`,
   TOC page references (real `.toc__page` spans the harness fills in one
   pass after layout — *not* CSS `target-counter`, whose per-page
   whole-document re-resolution made pagination O(pages²)), named
   full-bleed pages and a per-page watermark. Instead of handing that to the browser's
   print-to-PDF (which forces a system dialog and cannot name the file),
   the engine in `src/pdf/engine/` **transcribes the laid-out DOM into a
   true vector PDF** with `pdf-lib` + `fontkit`: it walks the DOM in
   paint order and replays backgrounds, borders, CSS gradients (as PDF
   shadings), inline SVG, images and word-positioned text runs measured
   with `Range.getClientRects()`. The result downloads directly as a
   `Blob` — no print dialog, exact filename, selectable text, subset
   fonts, clickable links and a PDF outline. Files are ~60% smaller than
   the browser's own print output because fonts are re-subset to only
   the glyphs used and every graphic stays vector. Raster approaches
   (html2canvas et al.) were rejected: fuzzy type, megabyte files, no
   text layer. The browser print path survives as a fallback if
   pagination fails.
3. **One builder, three consumers.** `buildDocumentHtml()` produces a
   self-contained HTML document used by the flow preview, the Publish
   review and the PDF download. The pages you approve in Publish are
   the pages you download — same iframe, same document.
4. **The flow preview is persistent.** The iframe shell (fonts, styles,
   scripts) loads once; edits swap only the rendered content in place
   via `postMessage`, so typing never flashes the preview or loses its
   scroll position. Block elements carry `data-line` source markers and
   the preview follows the editor cursor through them.
5. **Configuration over hardcoding.** Branding (names, links, colors,
   exams, watermark text) is data in IndexedDB, edited in Settings, and
   flows into print CSS as `--c-*` variables. Per-document layout
   (cover style, TOC, watermark, page size, density — including the
   layout-level Ultra Compact — question-bank answers placement) is
   data on the document. A global "document reading
   theme" (Settings → Appearance) re-derives the whole `--c-*` palette
   for a dark, eye-friendly rendering that flows through previews, PDF
   and HTML exports alike — brand hues are lightened with `color-mix`
   so headings and accents keep their identity on the dark ground.
6. **Vector-only branding.** The temple mark, the social icons in the
   page footer and the diagonal watermark are inline SVG generated from
   `src/brand/marks.ts`. No raster assets ship with the app.
7. **Few, intentional dependencies.** React, CodeMirror 6, markdown-it
   (+7 small plugins), Paged.js, Tailwind. Routing is a 40-line hash
   router; state is `useSyncExternalStore` over IndexedDB; there is no
   HTTP layer at all.

## Folder map

```
public/
├─ fonts/                bundled woff2 subsets + fonts.css (offline, no CDN)
└─ vendor/               Paged.js runtime (copied by scripts/sync-vendor.mjs
                         on npm install; gitignored)
src/
├─ main.tsx · App.tsx    bootstrap, theme, route switch (4 views)
├─ app.css               Tailwind v4 + design tokens (dark/light)
├─ lib/
│  ├─ types.ts           Doc, DocLayout, BrandConfig, Settings — the model
│  ├─ db.ts              minimal typed IndexedDB (docs + kv stores)
│  ├─ store.ts           app store: load, autosave (debounced + pagehide
│  │                     flush), delete-all, backup/restore
│  ├─ router.ts          hash router (#/, #/edit/:id[/:line], #/settings,
│  │                     #/help) — :line deep-links search hits
│  ├─ image.ts           editor image insert: downscales a pasted/dropped/
│  │                     uploaded picture and returns self-contained
│  │                     data-URI Markdown (no asset folder; embeds in the
│  │                     PDF as-is). Rendered as <figure> by the renderer.
│  ├─ presets.ts         named layout presets (localStorage): save the
│  │                     current cover/TOC/size/density set under a name and
│  │                     reapply to any document. UI convenience, not doc
│  │                     data, so it never travels in a backup.
│  ├─ session.ts         "Resume last session" — last open doc + cursor
│  │                     line in localStorage (throwaway UI state, read
│  │                     before the store loads, so not IndexedDB)
│  ├─ importer.ts        smart import: HTML→Markdown (DOMParser walk, no
│  │                     deps) for Word/GDocs/web/AI-chat paste, plain-text
│  │                     tidy, file staging (.md/.txt/.html/.docx + backup
│  │                     .json) — actual doc creation/insertion lives in
│  │                     components/ImportReview.tsx
│  ├─ questionText.ts    raw exam-paper → clean question dialect: a
│  │                     dependency-free normalizer that recovers
│  │                     question/statement/option/answer/solution
│  │                     structure from pasted or imported PYQ/MCQ text
│  │                     ("[3/23]", "Que.", two-level A–E + (1)–(4),
│  │                     packed options, exam-year tags, page-noise) so a
│  │                     real paper becomes a booklet with no relabeling
│  ├─ importTally.ts     shared "what changed" bookkeeping (Tally,
│  │                     summarize) used by importer.ts and docx.ts —
│  │                     split out so DOCX conversion can reuse it
│  │                     without an importer.ts ⇄ docx.ts circular import
│  ├─ docx.ts            .docx → Markdown: a hand-rolled ZIP central-
│  │                     directory reader (DecompressionStream for
│  │                     deflate — no zip library) + a WordprocessingML
│  │                     walk (headings, runs, numbering.xml-aware lists,
│  │                     tables, hyperlinks via relationships)
│  ├─ search.ts          universal search: scored linear scan over the
│  │                     in-memory corpus (title > metadata > body), with
│  │                     snippet + line for editor deep links
│  └─ utils.ts           uid, cx, debounce, dates, download, stats
├─ brand/
│  ├─ defaults.ts        default Polity Made Simple branding + settings
│  └─ marks.ts           temple mark, social icons, watermark SVG
├─ markdown/
│  ├─ renderer.ts        markdown-it pipeline: callouts, footnotes, task
│  │                     lists, mark/ins/sub/sup, anchors, \pagebreak,
│  │                     standalone-image → <figure> (caption + {width/align}),
│  │                     cross-references ("Question 42" / "Table 3" /
│  │                     "Figure 2" / "Note 15" → internal xref links;
│  │                     tables/figures get document-order ids),
│  │                     data-line source mapping, TOC extraction
│  └─ mcq.ts             question text parser + validation (plain TS, no deps)
├─ templates/
│  ├─ meta.ts            id, name, icon, starter, option flags (UI-safe,
│  │                     no markdown engine in the initial bundle)
│  ├─ starters.ts        new-document starter content
│  ├─ demos.ts           Examples gallery — rich showcase documents
│  └─ index.ts           body builders + print CSS per template
├─ pdf/
│  ├─ document.ts        THE builder: doc+brand → self-contained HTML
│  │                     (cover, TOC, runners, theme vars, @page);
│  │                     also buildDocContent/buildShellKey for the
│  │                     incremental flow preview
│  ├─ harness.ts         scripts inlined into the iframes: paged harness
│  │                     (running topic, watermark, TOC page numbers,
│  │                     fit/pinch zoom, page nav, cursor sync,
│  │                     completion signalling) and
│  │                     flow preview harness (in-place updates, cursor
│  │                     sync, inline contenteditable → doc/markdown)
│  ├─ engine/            the vector PDF engine (lazy chunk, loads on
│  │                     first export): index (entry) · transcribe (DOM
│  │                     walker) · canvas (CSS-space → PDF operators) ·
│  │                     fonts (fontkit subset + CSS face matching) ·
│  │                     gradient · svg · materialize (pseudo-elements) ·
│  │                     geometry
│  └─ styles/            print-base.css (foundation, incl. the Ultra
│                        Compact density rules) · covers.css ·
│                        notes/questions/revision/universal.css
│                        (one per document type)
├─ components/           Icon, Button, Modal, Toggle, Segmented, Toast,
│                        file-drop hook/overlay, CommandPalette (Ctrl+K:
│                        global search + actions), StudioNav (Home /
│                        Resume last session / Restart Studio header
│                        actions), ImportReview (confirm-or-edit staged
│                        imports before they become a document or an
│                        insert) — the latter two mounted once in App
└─ views/
   ├─ Library.tsx        home: hero, document grid (starred favourites
   │                     quick-access row, latest-modified/first-created
   │                     sorting), search, templates, Examples, theme
   │                     toggle (no persistent nav chrome)
   ├─ Editor.tsx         header, three resizable panes (settings pane ·
   │                     editor · preview), mobile write/preview tabs,
   │                     focus mode (hides toolbar + settings pane)
   ├─ editor/            CodeMirror wrapper (incl. find & replace via
   │                     @codemirror/search), commands, Toolbar, Preview
   │                     (flow/pages + doc-theme toggle), Details sheet
   │                     (cover color overrides + the Cover Designer),
   │                     Publish overlay
   ├─ Settings.tsx       appearance (incl. document reading theme),
   │                     branding, defaults, save/restore, your data
   └─ Help.tsx           the manual: Markdown syntax, a guide + tuned AI
                         prompt per template, workspace tips
```

## Publish flow

```
Publish PDF
  → buildDocumentHtml(mode: "paged", purpose: "preview", fileTitle)
  → full-screen iframe; Paged.js paginates; harness stamps watermark +
    running topics, reports pages
  → author reviews the exact pages (fit-width/fit-page, ± zoom,
    pinch-to-zoom, page navigation)
  → Download PDF → exportPaginatedPdf(iframe.document) transcribes the
    laid-out pages into a vector PDF and downloads it as a Blob; the
    file name is the resolved fileNamePattern
```

If pagination fails on unusual content, Publish offers a simplified
continuous-layout export (browser print) as a fallback; the engine also
falls back to print if transcription throws.

## Inline editing

In the flow preview, the cover title/subtitle and every heading are
`contenteditable`. The flow harness posts each committed edit to the
host; the Editor writes it straight back — title/subtitle to the doc
fields, headings to their source line in the Markdown (the `#`s are
preserved). While an element is focused the host pauses content swaps so
typing is never clobbered.

## Page chrome

- Header — exam/book (left) · running topic (center) · `page / pages`
  (right).
- Footer — brand lockup with tagline (left) · website (center) ·
  Telegram + WhatsApp vector icons, clickable (right).
- Cover pages are full-bleed with no chrome; the watermark is stamped
  on every content page by the harness.

## How to extend

- **New template** — add starter + entry in `templates/meta.ts`, a body
  builder + print CSS entry in `templates/index.ts`. Everything else
  (picker, details options, preview, publish) picks it up. Retiring one
  gets a mapping in `LEGACY_TEMPLATES` (`lib/store.ts`) so stored
  documents and backups migrate on load — that is how the old
  mcq/pyq/flashcards types became Question Bank and Universal.
- **New cover style** — add a `.cover--<id>` block in
  `pdf/styles/covers.css`, a pattern entry in `COVER_PATTERNS`
  (`pdf/document.ts`) and an entry in the `COVER_STYLES` list in
  `views/editor/Details.tsx`. Retired ids get a mapping in
  `LEGACY_COVERS` (`lib/store.ts`) so stored documents migrate.
- **The "custom" cover** is not a CSS palette: it is a full
  per-document design (`CoverDesign` in `lib/types.ts` — gradient,
  ink/accent, pattern, typography, alignment, frame, emblem, logo)
  written as inline `--cv-*` variables by `customCoverVars()`
  (`pdf/document.ts`) onto the shared cover skeleton, and edited in
  the Cover Designer (`views/editor/Details.tsx`), seeded from the
  preset the author was using. Colors from restored backups are
  sanitized (`resolveDesign`) before they reach the srcdoc. Extend it
  by adding a field to `CoverDesign`, a control in `CoverDesigner`,
  and a variable/class in `customCoverVars()` + `covers.css`.
- **New callout type** — one entry in `CALLOUTS` (`markdown/renderer.ts`)
  plus a `.callout--<type>` color rule in `pdf/styles/print-base.css`.
- **New example** — one entry in `templates/demos.ts`.
- **New toolbar action** — a command in `views/editor/commands.ts` and
  an entry in the `ACTION_GROUPS` registry in `views/editor/Toolbar.tsx`
  (add a keyboard binding in `CodeMirror.tsx` if it deserves one). Each
  entry's `defaultPinned` decides whether it starts in the always-visible
  bar or in More — the author can move it either way from the More menu's
  per-action pin toggle (persisted in localStorage), so `defaultPinned`
  is only the starting point, not a strict split.

## Import & universal search

Smart Paste intercepts the editor's paste event only when it can add value:
rich clipboard HTML (Word, Google Docs, web pages, AI chats) is converted to
the app's Markdown dialect by a dependency-free DOMParser walk in
`lib/importer.ts`; plain text gets only unambiguous fixes (unicode bullets,
zero-width junk, NBSP) so pasted Markdown and MCQ bodies (`Q1.`, `a)`) pass
through untouched. Every conversion is one CodeMirror transaction — Ctrl+Z
always restores the raw paste — and a toast summarizes what was converted.
The same converter backs drag-and-drop and the Import picker: files dropped
on the Library become documents (a leading `# Title` is promoted to the doc
title; a dropped backup .json restores), files dropped on the editor insert
at the cursor.

When pasted/imported text looks like an exam paper (`lib/questionText.ts`,
`looksLikeQuestionBank`), Smart Import routes it through the question-bank
normalizer instead of the plain-text tidy: it rebuilds the clean question
dialect (`markdown/mcq.ts`) — the reliable win for the plain-text path,
since even HTML paste keeps tables but never the *question* grammar (those
are ordinary paragraphs in the source). Such imports land as a
**Question Bank**; the answers mode (inline by default) decides how much
each card reveals.
Flattened Google-Docs/Word tables in the plain-text path become clean
bullet lists (lossless); true tables survive only via HTML paste, so the
existing `tableToMd` still owns real table reconstruction.

Search (`lib/search.ts`) is a scored linear scan — the whole corpus is
already in memory, so an index would be pure overhead at this scale. Content
hits carry a snippet and line number; the palette (Ctrl+K, `CommandPalette.tsx`)
and Library search both use it, and opening a content hit deep-links
`#/edit/:id/:line` to place the cursor on the match.

## Storage & data safety

IndexedDB database `polity-studio`: `docs` (one record per document)
and `kv` (`settings`, `brand`). Edits hit memory instantly and persist
with a 600 ms debounce per document; `pagehide`/`visibilitychange`
flush pending saves. Settings → Your data shows the storage estimate
and offers JSON backup/restore plus delete-all; the Library deletes
individual documents. Loading merges stored objects over the current
schema defaults and drops unknown fields, so removed features (e.g. the
old AI settings) clean themselves up.

Exported PDFs are never stored by the app — they go through the
browser's save dialog straight to the user's device.

## Fonts

Two representations of the same typefaces ship, both offline:

- `public/fonts/*.woff2` — the subset webfonts the UI and both previews
  render with, served with `unicode-range` so Devanagari loads only when
  Hindi text appears.
- `public/fonts/ttf/*.ttf` — decompressed at `postinstall` by
  `scripts/sync-vendor.mjs` (via `wawoff2`) and gitignored. The PDF
  engine embeds raw TTF because fontkit's subsetter is unreliable on
  WOFF2-reconstructed glyph tables. These are fetched only on export and
  re-subset to the glyphs actually used.

## Page-count authority chain

The Pages preview, Publish and the PDF all share one Paged.js pipeline,
so their counts always agree by construction. The editor scrollbar and
the Flow readout can't paginate, so they follow a three-tier authority
chain (`Editor.tsx`): the **exact** count from the last completed layout
(Pages or Publish) while body + geometry (`pageFactKey`, `pdf/document.ts`)
are unchanged → a **calibrated** count (last exact × word ratio) while
only the body has changed → the structural **heuristic**
(`estimatePages`, `lib/utils.ts`) when nothing has paginated yet.
Only the non-exact tiers are prefixed "≈". The heuristic has two models:
prose (words-per-page plus grounded per-element costs for headings, list
items, callouts and chapter breaks — verified within ±2% on real layouts
at 79/193/384 pages; the words-only model ran ~23% short on structured
notes) and — for Question Banks — a card model (per-question fixed cost
+ word flow) calibrated against real Paged.js layouts, because cards
carry layout cost no words-per-page constant can see (the words-only
model ran ~50% short). Absolute page counts can differ a few percent
between browser engine versions (text shaping); the exact and calibrated
tiers absorb that automatically because they come from real layouts on
the reader's own browser.

## Internal PDF navigation

Everything anchor-based rides one mechanism end to end: the renderer
emits ids (headings via markdown-it-anchor, `q-N` on question cards,
`table-N`/`fig-N` in document order, `fnN` from footnotes) and turns
plain-text cross-references ("Question 42", "Q7", "Table 3",
"Figure/Diagram 2", "Note 15") into `<a class="xref" href="#…">` links.
Both previews scroll such links in place; the PDF engine resolves every
`#` link to a real PDF `Dest` annotation (`resolveLinks` in
`engine/transcribe.ts`) and builds the bookmark outline from h1/h2 —
no browser hacks, works in Chrome, Adobe Reader, Edge and standard
readers. A reference whose target doesn't exist degrades to plain text
in the PDF (the engine drops unresolvable links).

## Performance & reliability

[docs/performance.md](./docs/performance.md) is the knowledge base:
per-stage benchmarks (100 → 1000 pages), the optimization history
(v4.0 → v4.3) with measured effects, what is at its structural floor,
known limitations and the priority-ordered roadmap — plus the committed
harness (`scripts/stress.mjs`) to re-measure any change. The shape of
the system, in one paragraph each:

- **Load cost.** The initial route loads no editor code: CodeMirror,
  markdown-it and the editor views are separate lazy chunks; the PDF
  engine (`pdf-lib` + `fontkit`, ~0.5 MB gzip) loads only on the first
  Download.
- **Build stage is cheap.** A 1000-page body assembles its full HTML in
  ~0.2 s; `renderer.ts` keeps a single-entry token memo so the body
  render and the TOC extraction (and the flow → paged rebuild pair)
  share one markdown-it parse.
- **Pagination is the wall — but a linear, safe one.** Paged.js costs
  ~50–60 ms/page, flat at every size since v4.4 (the TOC's CSS
  `target-counter` used to re-scan the whole accumulated document after
  every page — O(pages²), ~322 ms/page by page 766; the harness now
  fills real `.toc__page` spans in one pass after layout, byte-identical
  output). Since v4.3 it is *cooperative*: the Studio handler yields on
  a time budget, posts live progress, re-points Paged.js's rAF-driven
  queue at `setTimeout` (rAF is suspended in background tabs — the
  historical "export hangs" root cause), and a watchdog reports partial
  layouts instead of hanging. Layout waits for `document.fonts.ready`
  (`PagedConfig.before`) so breaks are always measured with the real
  fonts. Pages the handler has finished are stamped `.p-settled` and
  rendered with `content-visibility: auto`, so preview scrolling and
  zooming stay flat-cost at any document size.
- **Adaptive debounces.** The flow preview re-renders in place ~200 ms
  after the last keystroke (in-place innerHTML swap, skipped when the
  HTML didn't change); the paged preview re-paginates ~1.2 s after the
  last edit. Both scale with document size (to 1.2 s / 5 s) so typing
  never races the expensive work; the header word-count runs behind
  `useDeferredValue`.
- **Export.** The transcriber is linear (~25–35 ms/page), yields per
  page behind a live progress bar, and memoizes font resolution per
  (stack, weight, style, codepoint). Repeated per-page chrome ships once
  as PDF Form XObjects (~30% smaller files, pixel-diff-verified);
  content streams are Flate-compressed; fonts embed subset to used
  glyphs. Result: ~60% smaller than browser print output, ~4.2–4.5
  KB/page — the measured structural floor.
- **HTML export** snapshots the already-paginated DOM (no Paged.js
  re-ship, ~500 KB saved), inlines only the font scripts the text uses,
  and rides a ~2 KB viewer script.
