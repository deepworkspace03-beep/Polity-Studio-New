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
   TOC page references (`target-counter`), named full-bleed pages and a
   per-page watermark. Instead of handing that to the browser's
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
   the pages you download — same iframe, same document. The standalone
   HTML export (`pdf/htmlExport.ts`) is a fourth consumer of that same
   already-paginated DOM, not a separate render: it snapshots exactly
   what Publish is showing, which is why a Paged.js-only generated-content
   feature (target-counter TOC references, the chapter-number counter)
   needed its own resolution step before serializing — see
   `engine/materialize.ts`'s `resolveContent`, reused by both consumers.
4. **The flow preview is persistent.** The iframe shell (fonts, styles,
   scripts) loads once; edits swap only the rendered content in place
   via `postMessage`, so typing never flashes the preview or loses its
   scroll position. Block elements carry `data-line` source markers and
   the preview follows the editor cursor through them.
5. **Configuration over hardcoding.** Branding (names, links, colors,
   exams, watermark text) is data in IndexedDB, edited in Settings, and
   flows into print CSS as `--c-*` variables. Per-document layout
   (cover style, TOC, watermark, page size, density, MCQ answers
   placement) is data on the document. A global "document reading
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
8. **Offline-first, hand-rolled service worker.** `public/sw.js` is
   framework-free: network-first navigations with a cached-shell
   fallback, cache-first hashed assets (Vite content-hashing makes a
   cache hit byte-identical to a fresh fetch, so cache-first is safe,
   not just fast), and an install-time app-shell precache so the app
   works offline after a single online visit — not only after a second
   reload. Updates wait for the page to ask (`lib/pwa.ts` +
   `UpdateBanner`) rather than swapping the running app out from under
   an in-progress edit; documents live entirely in IndexedDB, untouched
   by the worker, so an update can never lose data.

## Folder map

```
public/
├─ fonts/                bundled woff2 subsets + fonts.css (offline, no CDN)
├─ vendor/               Paged.js runtime (copied by scripts/sync-vendor.mjs
│                        on npm install; gitignored)
└─ sw.js                 service worker: network-first navigations (cached-
                         shell fallback offline), cache-first hashed assets,
                         install-time app-shell precache. See lib/pwa.ts.
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
│  ├─ pwa.ts             service worker registration + update detection
│  │                     (registers public/sw.js, surfaces UpdateBanner
│  │                     when a new version has finished installing)
│  └─ utils.ts           uid, cx, debounce, dates, download, stats
├─ brand/
│  ├─ defaults.ts        default Polity Made Simple branding + settings
│  └─ marks.ts           temple mark, social icons, watermark SVG
├─ markdown/
│  ├─ renderer.ts        markdown-it pipeline: callouts, footnotes, task
│  │                     lists, mark/ins/sub/sup, anchors, \pagebreak,
│  │                     standalone-image → <figure> (caption + {width/align}),
│  │                     data-line source mapping, TOC extraction
│  └─ mcq.ts             MCQ text parser + validation (plain TS, no deps)
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
│  ├─ htmlExport.ts      standalone HTML snapshot: clones the already-
│  │                     paginated Publish DOM, bakes generated-content
│  │                     counters that only resolve inside Paged.js's own
│  │                     runtime (see engine/materialize.ts) into literal
│  │                     CSS, and inlines only the font faces the
│  │                     document actually uses
│  ├─ harness.ts         scripts inlined into the iframes: paged harness
│  │                     (running topic, watermark, fit/pinch zoom, page
│  │                     nav, cursor sync, completion signalling) and
│  │                     flow preview harness (in-place updates, cursor
│  │                     sync, inline contenteditable → doc/markdown)
│  ├─ engine/            the vector PDF engine (lazy chunk, loads on
│  │                     first export): index (entry) · transcribe (DOM
│  │                     walker) · canvas (CSS-space → PDF operators) ·
│  │                     fonts (fontkit subset + CSS face matching) ·
│  │                     gradient · svg · materialize (pseudo-elements +
│  │                     generated-content counter resolution, shared by
│  │                     both the PDF engine and htmlExport.ts) · geometry
│  └─ styles/            print-base.css (foundation) · covers.css ·
│                        notes.css · question-bank.css (MCQ/PYQ merged —
│                        one unified question-bank template) · revision.css
│                        (Quick Revision + Flash Cards merged)
├─ components/           Icon, Button, Modal, Toggle, Segmented, Toast,
│                        file-drop hook/overlay, CommandPalette (Ctrl+K:
│                        global search + actions), StudioNav (Home /
│                        Resume last session / Restart Studio header
│                        actions), ImportReview (confirm-or-edit staged
│                        imports before they become a document or an
│                        insert), UpdateBanner (service-worker update
│                        prompt) — mounted once in App
└─ views/
   ├─ Library.tsx        home: hero, document grid, search, templates,
   │                     Examples, theme toggle (no persistent nav chrome)
   ├─ Editor.tsx         header, three resizable panes (settings pane ·
   │                     editor · preview), mobile write/preview tabs,
   │                     focus mode (hides toolbar + settings pane)
   ├─ editor/            CodeMirror wrapper (incl. find & replace via
   │                     @codemirror/search), commands (incl. image
   │                     align/width layout, Smart Format, Replace from
   │                     Clipboard), Toolbar, Preview (flow/pages +
   │                     doc-theme toggle), Details sheet — collapsible
   │                     Cover Designer + PDF Designer (typography,
   │                     density, page size, TOC, watermark, answers)
   │                     sections — Publish overlay
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
  (picker, details options, preview, publish) picks it up.
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
  an entry in the `GROUPS` list in `views/editor/Toolbar.tsx` (add a
  keyboard binding in `CodeMirror.tsx` if it deserves one).

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
are ordinary paragraphs in the source). It defaults such imports to the
**PYQ** template when worked solutions or exam tags are present, else MCQ.
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

## Performance notes

- Initial route loads no editor code: CodeMirror, markdown-it and the
  editor views are separate lazy chunks. The PDF engine (`pdf-lib` +
  `fontkit`, ~0.5 MB gzip) is its own chunk that loads only on the first
  Download, never during editing.
- The flow preview re-renders in place ~200 ms after the last keystroke
  (innerHTML swap of the content root — no iframe reload, no font
  refetch), and skips the swap entirely when the rendered HTML didn't
  change. The paged preview re-paginates ~1.2 s after the last edit.
  Both debounces scale with document size (up to 1.2 s flow / 5 s
  paged for very large documents) so typing in a 400-page document
  never races the expensive work; pagination remains opt-in via the
  Flow/Pages toggle. The word-count in the editor header is computed
  behind `useDeferredValue` so the full-text scan never competes with
  a keystroke.
- The export hot path resolves fonts per character; a synchronous
  (family stack, weight, style, codepoint) → face memo turns that into
  a Map hit after warm-up, which removes millions of microtask
  allocations on a 400-page export. The transcriber yields to the
  event loop after every page so the progress bar stays live.
- The engine's pseudo-element materializer scopes its scan to the base
  selectors that the document's stylesheets actually attach `::before`/
  `::after` to (complete ground truth — inline styles can't create
  pseudos and every sheet is first-party), instead of probing every
  element of every page, and yields between pages. On a 405-page
  document that removes a measured ~3s synchronous freeze at the start
  of every export on tablet-class CPUs.
- While Publish is open, the editor's Pages preview suspends (tears its
  paginated DOM down and rebuilds on return) — otherwise two full
  copies of a large document's layout are alive at once, which is what
  pushes memory-constrained Android Chrome tabs into OOM.
- Paged.js layout reports live progress (`paged-progress` → "Typesetting
  pages… N" in Publish and the Pages preview), and a stall watchdog in
  the harness always runs: ~25s with no new page reports a partial (or
  failed-if-empty) layout instead of hanging the host forever; a caught
  error tightens the window to ~3s.
- The standalone HTML export snapshots the already-paginated DOM from
  the Publish iframe instead of re-shipping Paged.js (~500 KB saved);
  it inlines only the font faces whose scripts (latin / latin-ext /
  Devanagari) actually occur in the text, un-materializes the PDF
  engine's `<x-pseudo>` boxes, and rides a ~2 KB viewer script (zoom,
  pinch, page indicator). The file opens instantly — layout is done.
- Exported PDFs are ~60% smaller than the browser's own print output for
  the same document (e.g. the 10-page notes demo: ~120 KB vs ~210 KB),
  because the engine re-subsets fonts to used glyphs and keeps every
  graphic vector. Export is ~1 s for a 10-page document, all on the main
  thread inside the export overlay with a progress bar.
