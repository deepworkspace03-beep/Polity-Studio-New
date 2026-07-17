# Performance & reliability — the knowledge base

The single reference for how Polity Studio performs at scale, why it is
built the way it is, what has been optimized (v4.0 → v4.3), what is at
its structural floor, and where the next real levers are. Earlier
session logs (`perf-inside-pages.md`, `perf-1000-page-session.md`) are
consolidated here (and removed — git history keeps the full write-ups);
the discipline they followed still applies to every future change:

> **Measure → root-cause → compare alternatives → simplest robust fix →
> benchmark → regression-test → document.** Reject speculative
> optimization; keep an optimization only if it helps with no cost to
> output quality.

## The pipeline and where time actually goes

```
Markdown ──build──▶ HTML ──Paged.js──▶ paginated DOM ──engine──▶ vector PDF
  ~0.2 s at 1000p     (~55–70 ms/page — THE wall)      (~25–35 ms/page)
```

Measured on the real production build in headless Chromium (the
committed harness, `scripts/stress.mjs`), synthetic but realistic
study-material bodies, A4 · compact · cover + TOC + watermark:

| Stage | Cost shape | 1000-page reality (desktop) |
|---|---|---|
| Markdown → HTML (`buildDocumentHtml`) | linear, tiny | ~0.2 s |
| Flow preview (continuous, no pagination) | linear, cheap | instant updates; in-place swaps |
| **Pages / Publish pagination (Paged.js)** | **linear, ~55–70 ms/page** | **~1 min — the dominant cost** |
| PDF transcription (`pdf/engine`) | linear, ~25–35 ms/page | tens of seconds, live progress bar |
| PDF serialization + download | linear, small | seconds |

The wall is and remains **Paged.js pagination**: it measures content and
finds break points page by page on the main thread; the cost is
inherent to its layout model. Everything around it has been made
non-blocking, observable and interruption-safe (v4.3) — but the O(pages)
layout time itself only moves with a chunked/virtualized pagination
redesign (see Roadmap).

## v4.3 — reliability engineering (Phase 5)

Phase 5 attacked the "large exports hang" class of failures with three
root-cause fixes in the pagination scheduling, none of which touch
layout output (page-count parity verified at every size):

1. **Background-safe scheduling.** Paged.js drives its per-page render
   queue with `requestAnimationFrame` — which browsers **suspend
   completely** for hidden tabs and locked screens. A minutes-long
   large-document layout therefore froze *forever* the moment the user
   switched apps or the tablet screen dimmed: the real-world "export
   hangs". The Studio handler now re-points the queue's tick at
   `setTimeout` (throttled in background, never suspended), so layout
   always finishes — backgrounded, it just runs slower until the tab
   returns. (`src/pdf/harness.ts`, `StudioHandler.constructor`.)
2. **Cooperative yielding + live progress.** Paged.js awaits every
   `afterPageLayout` hook, so the handler yields a macrotask on a 32 ms
   budget and posts throttled `paged-progress` messages. The host UIs
   (Pages toolbar, Publish overlay) show a live "Laying out pages… N"
   count, and input/paint stay serviced throughout. Measured main-thread
   responsiveness during a 250-page layout: longest block ~0.7 s (the
   initial Paged.js content parse) instead of ~1.1 s, with all
   subsequent blocks under ~300 ms.
3. **A layout watchdog that can actually run.** The stall watchdog
   (report partial pages rather than hang forever) previously only armed
   on a render error; a silent livelock hung forever. It now also arms
   unconditionally (~20 s of zero page progress = report what exists),
   and — because of the yields above — its timers genuinely fire during
   pagination.

Plus one *rendering-cost* fix with the same zero-output-change property:

4. **`content-visibility: auto` on settled pages.** Each page the
   handler finishes is stamped `.p-settled`; preview CSS then lets the
   browser skip style/layout/paint for off-screen pages entirely. Scroll
   and zoom cost stay flat as the document grows (measured: max
   main-thread gap while jumping to the middle of a large paged preview
   ~17–20 ms at every size, 100 → 1000 pages). Pages keep their explicit
   Paged.js size, so scrollbars, page navigation, fit-zoom and geometry
   APIs stay exact; the transcriber forces each page visible while
   walking it, and print media restores full rendering.

### Question Bank pagination contract (v4.3)

A question card previously carried `break-inside: avoid` on the whole
card — stem, options *and* worked solution. Long solutions pushed whole
cards to the next page (large white gaps, inflated page counts) and an
over-long card was a layout-failure risk. The contract now:

- **A question is never split** — `.q__main` (header + stem + options)
  stays atomic.
- **A long solution continues naturally** across pages as an **open
  box**: Paged.js marks split halves with `data-split-to` /
  `data-split-from`, and the card CSS opens the facing edges (no bottom
  border/radius on the first half, no top on the continuation) so the
  spine runs on quietly — no "continued…" labels. Explanation blocks in
  answers-at-end mode behave the same.

Measured effect on a 300-question bank with long solutions: **201 → 168
pages (−16%)** — the same content, better filled pages, smaller PDF.

## Benchmarks (v4.3, production build, headless desktop Chromium)

<!-- BENCH:START -->
| Document | Pages | Paginate | Publish layout | PDF export | PDF size | DOM nodes | JS heap | Export |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| Notes 100p | 79 | 5.5 s | 4.1 s | 5.1 s | 357 KB | 9.9 k | 16 MB | ✅ |
| Notes 250p | 193 | 16.8 s | 18.0 s | 13.8 s | 837 KB | 24.1 k | 22 MB | ✅ |
| Notes 500p | 384 | 60.5 s | 69.2 s | 29.5 s | 1.6 MB | 48.0 k | 22 MB | ✅ |
| Notes 1000p | 766 | 247 s | 272 s | 82 s | 3.2 MB | 95.7 k | 33 MB | ✅ |
| QB 1500q | 751 | 77.6 s | 97.1 s | 112.5 s | 4.5 MB | 112.8 k | 26 MB | ✅ |
| QB 300q, long solutions | 168 | 9.8 s | 8.4 s | 14.3 s | 1.2 MB | 24.5 k | 16 MB | ✅ |
<!-- BENCH:END -->

Reading the table honestly:

- **Every scenario completes**, including full PDF export at 751–766
  pages — the Phase-5 success criterion. During pagination the
  main thread is yielded regularly (live progress counts, scroll probe
  gaps of ~17–55 ms at *every* size thanks to settled-page
  `content-visibility`).
- **Notes pagination is superlinear** at scale: ~70 ms/page at 79
  pages, ~87 at 193, ~158 at 384, ~322 at 766 — Paged.js's per-page
  bookkeeping (counters, target-counter TOC references, split tracking)
  re-scans the accumulated document on every page, so per-page cost
  grows with pages already laid out. A Question Bank at the same page
  count stays at ~103 ms/page (no TOC, no target-counters, cards break
  cleanly) — strong evidence the TOC reference resolution dominates the
  growth for prose notes. Only chunked pagination (roadmap 1) changes
  this shape. A side effect: at very large sizes responsiveness degrades
  to per-page granularity (the cooperative yield can only run *between*
  pages, and one page's layout can reach seconds near page 700+); live
  progress, background safety and the watchdog are unaffected.
- JS heap stays ~16–33 MB even at 1000 pages — memory pressure lives in
  the renderer's layout tree (DOM nodes ~125/page), which
  `content-visibility` keeps out of the rendering pipeline for
  off-screen pages.
- An Android tablet is roughly 2–4× slower per page than this desktop
  Chromium; the reliability properties (backgroundable, responsive,
  watchdogged, progress-visible) are identical.

## Optimization history (what already landed)

| Version | Change | Measured effect |
|---|---|---|
| v4.0 | Removed redundant paper-on-paper fills; text-only question header | fewer PDF ops per card, no visual change |
| v4.2 | Markdown parsed once per rebuild (single-entry token memo shared by body render + TOC extraction) | prose rebuild −21…−38% |
| v4.2.1 | Temple mark as one compound `<path>` (was 6 nodes, cloned into every page ×2) | −66% repeated SVG nodes, −8% total DOM, −5% pagination time |
| v4.2.2 | Repeated per-page chrome (watermark/footer temple, social icons) cached as PDF **Form XObjects**, replayed per page | **PDF −30%** on large docs, pixel-identical (diff-verified) |
| v4.3 | Background-safe + cooperative pagination, live progress, watchdog, `content-visibility` on settled pages, QB split-solution contract | large layouts always finish; app stays responsive; QB pages −16% on solution-heavy banks |

## What is at its structural floor (measured, not assumed)

- **PDF size.** Byte composition of a real export: ~90–95% is per-page
  Flate-compressed content streams (the actual text/vector operators,
  ~4.2–4.5 KB/page); the rest is object streams and the shared chrome
  forms. pdf-lib compresses content streams by default; fonts are
  fetched once per face and embedded subset to used glyphs; repeated
  chrome is already shared. There is no further meaningful reduction
  without discarding content or quality. (Evaluated and rejected:
  skipping the white page fill — ~0.8% for an engine risk.)
- **Markdown / HTML export size.** The `.md` export *is* the source
  (plus embedded images) — nothing to shrink. The standalone HTML
  export snapshots the laid-out pages, so it is inherently linear in
  page count; it already strips Paged.js (~500 KB) and inlines only the
  font scripts actually used.
- **Pagination time per page.** ~55–70 ms/page is Paged.js's layout
  model (measure content, find break point, build page box). Node-count
  reduction (v4.2.1) shaved ~5%; the remainder does not move without
  chunked pagination.
- Rejected after measurement (v4.2.1): `text-rendering: optimizeSpeed`
  — zero improvement, typographic risk.

## Known limitations (honest)

- A 1000-page document is a minutes-long layout on desktop, longer on a
  tablet. It now *always finishes* — visibly, responsively,
  interruptibly — but it is not fast.
- Pagination and PDF transcription run on the main thread by design:
  transcription needs live layout APIs (`getClientRects`), and the
  preview iframe shares the thread. Yielding keeps the app usable.
- The PDF export holds the whole `pdf-lib` document in memory;
  practical ceiling untested beyond ~1000 pages / ~10 MB PDFs.

## Roadmap (priority-ordered, evidence-backed)

1. **Chunked / virtualized pagination** — the only lever on the
   ~55–70 ms/page wall. Paginate in chapter-sized chunks with yields and
   a persistent page-number offset, or virtualize the page DOM.
   Session-sized redesign of the Paged.js integration + export path;
   the export contract ("what you approve is what you download") must
   survive it.
2. **`url()`-SVG watermark background** — remove the per-page watermark
   clone from the pagination DOM (needs transcriber `url()`-background
   support first). Smaller win now that settled pages skip rendering.
3. **Web Worker for the Markdown build** — only worthwhile if documents
   grow far beyond 1000 pages; the build is ~0.2 s today.

## How to re-measure (the harness)

`scripts/stress.mjs` drives the real production build in headless
Chromium: injects synthetic Notes/Question-Bank documents into
IndexedDB, opens Pages mode, and measures pagination time, live-progress
events, main-thread responsiveness (rAF-gap), DOM size, JS heap, then
runs Publish → Download PDF and records export time/size/success.

```bash
npm run build && npm run preview -- --port 4173 --host 127.0.0.1 &
npm i --no-save playwright-core     # not a repo dependency on purpose
node scripts/stress.mjs             # ONLY=notes-100,qb-1500 to filter
```

Compare any change against these tables before shipping it.
