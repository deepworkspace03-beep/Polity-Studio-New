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
   the pages you download — same iframe, same document.
4. **The flow preview is persistent.** The iframe shell (fonts, styles,
   scripts) loads once; edits swap only the rendered content in place
   via `postMessage`, so typing never flashes the preview or loses its
   scroll position. Block elements carry `data-line` source markers and
   the preview follows the editor cursor through them.
5. **Configuration over hardcoding.** Branding (names, links, colors,
   exams, watermark text) is data in IndexedDB, edited in Settings, and
   flows into print CSS as `--c-*` variables. Per-document layout
   (cover style, TOC, watermark, page size, density, MCQ answers
   placement) is data on the document.
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
├─ main.tsx · App.tsx    bootstrap, theme, route switch (3 views)
├─ app.css               Tailwind v4 + design tokens (dark/light)
├─ lib/
│  ├─ types.ts           Doc, DocLayout, BrandConfig, Settings — the model
│  ├─ db.ts              minimal typed IndexedDB (docs + kv stores)
│  ├─ store.ts           app store: load, autosave (debounced + pagehide
│  │                     flush), delete-all, backup/restore
│  ├─ router.ts          hash router (#/, #/edit/:id, #/settings)
│  └─ utils.ts           uid, cx, debounce, dates, download, stats
├─ brand/
│  ├─ defaults.ts        default Polity Made Simple branding + settings
│  └─ marks.ts           temple mark, social icons, watermark SVG
├─ markdown/
│  ├─ renderer.ts        markdown-it pipeline: callouts, footnotes, task
│  │                     lists, mark/ins/sub/sup, anchors, \pagebreak,
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
│  ├─ harness.ts         scripts inlined into the iframes: paged harness
│  │                     (running topic, watermark, fit/pinch zoom, page
│  │                     nav, cursor sync, completion signalling) and
│  │                     flow preview harness (in-place updates, cursor
│  │                     sync, inline contenteditable → doc/markdown)
│  ├─ engine/            the vector PDF engine (lazy chunk, loads on
│  │                     first export): index (entry) · transcribe (DOM
│  │                     walker) · canvas (CSS-space → PDF operators) ·
│  │                     fonts (fontkit subset + CSS face matching) ·
│  │                     gradient · svg · materialize (pseudo-elements) ·
│  │                     geometry
│  └─ styles/            print-base.css (foundation) · covers.css ·
│                        notes/revision/mcq/flashcards.css
├─ components/           Icon, Button, Modal, Toggle, Segmented, Toast…
└─ views/
   ├─ Library.tsx        document grid, search, template picker, Examples
   ├─ Editor.tsx         header, split/tabbed layout
   ├─ editor/            CodeMirror wrapper, commands, Toolbar, Preview
   │                     (flow/pages), Details sheet, Publish overlay
   └─ Settings.tsx       appearance, branding, defaults, your data
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
  `pdf/styles/covers.css` and an entry in the `COVER_STYLES` list in
  `views/editor/Details.tsx`.
- **New callout type** — one entry in `CALLOUTS` (`markdown/renderer.ts`)
  plus a `.callout--<type>` color rule in `pdf/styles/print-base.css`.
- **New example** — one entry in `templates/demos.ts`.
- **New toolbar action** — a command in `views/editor/commands.ts` and
  an entry in the `GROUPS` list in `views/editor/Toolbar.tsx` (add a
  keyboard binding in `CodeMirror.tsx` if it deserves one).

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
  refetch). The paged preview re-paginates 1.2 s after the last edit;
  pagination is the expensive path and is opt-in via the Flow/Pages
  toggle.
- Exported PDFs are ~60% smaller than the browser's own print output for
  the same document (e.g. the 10-page notes demo: ~120 KB vs ~210 KB),
  because the engine re-subsets fonts to used glyphs and keeps every
  graphic vector. Export is ~1 s for a 10-page document, all on the main
  thread inside the export overlay with a progress bar.
