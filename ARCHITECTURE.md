# Polity Studio v2 — Architecture

This document describes the code that is actually in this repository, and
how to extend it.

## Design decisions

1. **Client-only static app.** The entire product — editing, storage,
   pagination, PDF export, AI — runs in the browser. There is no server,
   no database, no auth surface, nothing to patch or migrate. Deployment
   is "serve a folder", which any host does reliably.
2. **The PDF engine is Paged.js in the user's browser.** v1 ran Paged.js
   inside a server-side headless Chromium; v2 runs the *same* engine in a
   hidden same-origin iframe and hands the paginated result to the
   browser's own print-to-PDF. This restores everything native browser
   printing cannot do — running headers/footers (`position: running()`),
   `counter(pages)`, TOC page references (`target-counter`), named
   full-bleed pages, a per-page watermark — with zero server cost.
3. **One builder, three consumers.** `buildDocumentHtml()` produces a
   self-contained HTML document used by the flow preview, the paged
   preview and the export frame. Preview and PDF cannot drift.
4. **Configuration over hardcoding.** Branding (names, links, colors,
   exams, watermark text) is data in IndexedDB, edited in Settings, and
   flows into print CSS as `--c-*` variables. Per-document layout (cover
   style, TOC, watermark, closing page, page size, density, MCQ answers
   placement) is data on the document.
5. **Vector-only branding.** The temple mark and the diagonal watermark
   are inline SVG generated from `src/brand/marks.ts`. No raster assets
   ship with the app, which keeps pages crisp and PDFs small.
6. **Few, intentional dependencies.** React, CodeMirror 6, markdown-it
   (+3 plugins), Paged.js, Tailwind. Routing is a 40-line hash router;
   state is `useSyncExternalStore` over IndexedDB; there is no HTTP layer.

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
│  │                     flush), backup/restore
│  ├─ router.ts          hash router (#/, #/edit/:id, #/settings)
│  └─ utils.ts           uid, cx, debounce, dates, download, stats
├─ brand/
│  ├─ defaults.ts        default Polity Made Simple branding + settings
│  └─ marks.ts           temple mark + watermark SVG generators
├─ markdown/
│  ├─ renderer.ts        markdown-it pipeline: callouts, footnotes, task
│  │                     lists, anchors, \pagebreak, TOC extraction
│  └─ mcq.ts             MCQ text parser + validation (plain TS, no deps)
├─ templates/
│  ├─ meta.ts            id, name, icon, starter, option flags (UI-safe,
│  │                     no markdown engine in the initial bundle)
│  ├─ starters.ts        new-document starter content
│  └─ index.ts           body builders + print CSS per template
├─ pdf/
│  ├─ document.ts        THE builder: doc+brand → self-contained HTML
│  │                     (cover, TOC, runners, closing, theme vars, @page)
│  ├─ harness.ts         script inlined into paged documents: running
│  │                     topic, per-page watermark, fit-to-width preview,
│  │                     completion signalling
│  ├─ export.ts          hidden-iframe pagination → print dialog, with
│  │                     simple-layout fallback
│  └─ styles/            print-base.css (foundation) · covers.css ·
│                        notes/revision/mcq/flashcards.css
├─ ai/
│  ├─ client.ts          provider adapters (OpenAI-compatible, Anthropic),
│  │                     SSE streaming, error mapping
│  └─ prompts.ts         system prompt + workflow library
├─ components/           Icon, Button, Modal, Toggle, Segmented, Toast…
└─ views/
   ├─ Library.tsx        document grid, search, template picker
   ├─ Editor.tsx         header, split/tabbed layout, export overlay
   ├─ editor/            CodeMirror wrapper, Toolbar, Preview (flow/pages),
   │                     Details sheet, AiPanel
   └─ Settings.tsx       appearance, branding, export defaults, AI, data
```

## Export flow

```
Export PDF
  → buildDocumentHtml(mode: "paged", purpose: "export")
  → hidden same-origin iframe (srcdoc)
  → Paged.js paginates; harness stamps watermark + running topics,
    then signals __PAGED_DONE__ / postMessage
  → iframe.contentWindow.print()  (no popups — tablet-safe)
  → user picks "Save as PDF"; the document <title> is the filename
```

If pagination fails or times out, the exporter falls back to printing the
simple flow layout and tells the user via toast.

## How to extend

- **New template** — add starter + entry in `templates/meta.ts`, a body
  builder + print CSS entry in `templates/index.ts`. Everything else
  (picker, details options, preview, export) picks it up.
- **New cover style** — add a `.cover--<id>` block in
  `pdf/styles/covers.css` and an entry in the `COVER_STYLES` list in
  `views/editor/Details.tsx`.
- **New callout type** — one entry in `CALLOUTS` (`markdown/renderer.ts`)
  plus a `.callout--<type>` color rule in `pdf/styles/print-base.css`.
- **New AI workflow** — one entry in `ai/prompts.ts`.
- **New AI provider** — implement the adapter in `ai/client.ts`; the
  settings UI is driven by `PROVIDER_PRESETS`.
- **New export format** — add a builder alongside `pdf/export.ts`
  consuming the same `buildDocumentHtml` output (e.g. standalone HTML).

## Storage & data safety

IndexedDB database `polity-studio`: `docs` (one record per document) and
`kv` (`settings`, `brand`). Edits hit memory instantly and persist with a
600 ms debounce per document; `pagehide`/`visibilitychange` flush pending
saves. Settings → Your data exports/imports a JSON backup (documents +
branding + preferences; API keys are deliberately excluded).

## Performance notes

- Initial route loads no editor code: CodeMirror, markdown-it and the
  editor views are separate lazy chunks.
- The flow preview re-renders debounced at 500 ms; the paged preview at
  1.5 s (pagination is the expensive path and is opt-in via the
  Flow/Pages toggle).
- Fonts are subsetted woff2 served locally with `unicode-range`, so
  Devanagari fonts download only when Hindi text is used.
- PDFs stay small (~300 KB for a 12-page illustrated document) because
  every graphic is vector and fonts are subsets.
