# Performance & reliability — the knowledge base

The single reference for how Polity Studio performs at scale, why it is
built the way it is, what has been optimized (v4.0 → v4.6), what is at
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
  ~0.2 s at 1000p     (~50–60 ms/page, linear — THE wall)   (~25–35 ms/page)
```

Measured on the real production build in headless Chromium (the
committed harness, `scripts/stress.mjs`), synthetic but realistic
study-material bodies, A4 · compact · cover + TOC + watermark:

| Stage | Cost shape | 1000-page reality (desktop) |
|---|---|---|
| Markdown → HTML (`buildDocumentHtml`) | linear, tiny | ~0.2 s |
| Flow preview (continuous, no pagination) | linear, cheap | instant updates; in-place swaps |
| **Pages / Publish pagination (Paged.js)** | **linear, ~50–60 ms/page (v4.4 — was superlinear, ~322 ms/page at 766p)** | **~45 s — the dominant cost** |
| PDF transcription (`pdf/engine`) | linear, ~25–35 ms/page | tens of seconds, staged progress + ETA |
| PDF serialization + download | linear, small | seconds |

The wall is and remains **Paged.js pagination**: it measures content and
finds break points page by page on the main thread; the per-page cost is
inherent to its layout model. v4.4 removed the *superlinear* part (the
TOC's `target-counter`, below); everything around the remaining linear
cost has been made non-blocking, observable and interruption-safe
(v4.3) — the O(pages) layout time itself only moves with a
chunked/virtualized pagination redesign (see Roadmap).

## v4.8 — Question Bank redesign (page economy + navigation)

The QB layout contract changed (see "Smart pagination" below for the
what and why). Re-measured on the same harness scenarios, same machine
class, production build:

| Scenario | v4.4 baseline | v4.8 | Δ |
|---|--:|--:|--:|
| QB 1500q — pages | 751 | 602 | **−20%** |
| QB 1500q — fill | 84% | 95% | +11 pts |
| QB 1500q — paginate | 67.2 s (~89 ms/page) | 47.7 s (~79 ms/page) | −29% wall |
| QB 1500q — PDF size | 5.0 MB | 4.5 MB | −11% |
| QB 300q long sols — pages | 154 | 116 | **−25%** |
| QB 300q long sols — PDF size | 1.3 MB | 0.95 MB | −29% |
| Blank pages / export success | 0 / ✅ | 0 / ✅ | unchanged |

Same content, meaningfully fewer pages and smaller files; the per-page
pagination constant is unchanged (the wall saving is simply fewer
pages). The gains come from three static levers — the QB-specific
`@page` frame, separable option grids with atomic rows, and unit-break
defaults — all resolved in the normal single layout pass, so v4.4's
linearity holds. The optional two-column mode adds a further −22%
pages on a 300-question ultra bank (108 → 84) at a modestly higher
per-page layout cost (multicol measurement), and exports fine through
the vector engine (multicol positions come from real client rects).
The QB card estimate model (`estimatePages`) was recalibrated to the
new frame (predictions 593/121 vs actual 602/116).

## v4.4 — pagination made linear + deterministic (Phase 6)

1. **The superlinearity root cause: CSS `target-counter` TOC page
   numbers.** Paged.js's `TargetCounters.afterPageLayout` runs after
   *every* page and, for each still-unresolved TOC entry, re-queries the
   whole accumulated pages DOM and — when an entry resolves — walks
   **every laid-out page with `getComputedStyle`** to compute the page
   counter, then forces a reflow. With a TOC that is O(pages² ×
   entries): measured ~70 → ~322 ms/page between 79 and 766 pages,
   while a TOC-less Question Bank stayed flat (~103 ms/page) — the
   Phase-5 table's "superlinear notes" row, fully explained. The fix:
   the TOC renders real `.toc__page` spans and the harness fills them
   **once** after layout from Paged.js's own `data-page-number`
   (`fillTocPages` in `src/pdf/harness.ts`, called inside `report()` so
   watchdog partial layouts get numbers too). Byte-identical PDFs at
   every size (357/837/1637 KB, pages 79/193/384 unchanged); pagination
   −35% at 100p, −50% at 250p, −64% at 500p, and flat ~52–57 ms/page at
   every size. Lesson recorded in AI_GUIDE.md: never use
   `target-counter()`; resolve cross-page references in one post-layout
   pass.
2. **Font-deterministic layout.** The polyfill auto-starts at
   DOMContentLoaded — with `font-display: swap` that can measure breaks
   with fallback metrics. Latin faces are always warm (the app shell
   uses them), but Devanagari faces load on a document's first use and
   raced the first layout. `buildDocumentHtml` now sets
   `window.PagedConfig.before` to await `document.fonts.ready` (raced
   with a 5 s cap so a failed font can never stall layout).
3. **Correctness probes in the harness.** `blankPages` (content pages
   with no text/figure) and `avgFillPct` (mean content-area fill,
   excluding cover/TOC/final page) are now measured on every run —
   0 blank pages everywhere; fill is ~96–97% on notes and
   solution-heavy banks, ~84% on short-card banks (see "Smart
   pagination" for why that gap is intentional).

## v4.6 — large-document navigation (workspace redesign)

Two navigation costs that only bite at scale, both reproduced on a real
~193k-word / **1069-page** body in the production build:

1. **Go-to-Top/Bottom: the "first-click hang" was smooth scroll.** At
   500+ pages CodeMirror hands the scroller a **~700k px `scrollHeight`**
   (21 lines rendered, the rest virtualised). `scrollTo({top: scrollHeight,
   behavior:"smooth"})` reached only **6,964 px (1%) and then stalled** —
   the browser caps smooth-scroll velocity and CM re-measures line heights
   as it travels, so the target keeps moving and the animation gives up.
   Measured: smooth = stuck at 1% after ~280 ms; **instant `scrollTop =
   scrollHeight` = full bottom (100%) in 12 ms**. The fix is an instant jump
   on a single tap (re-asserted a couple of frames for the growing
   `scrollHeight`), with press-and-hold for a smooth per-frame glide.

2. **Manual scroll no longer posts to the preview.** The editor previously
   reported a scroll fraction to the preview on *every* wheel/touch frame
   (rAF-throttled, but still a `postMessage` + an iframe scroll per frame on
   a 700k px scroller). Reading is now independent; sync fires only on
   cursor placement and an explicit scrollbar drag, removing that per-frame
   work from the hot path entirely.

Button visibility also became viewport-aware (a screen from an end, reported
by the harness) instead of a fixed 6% fraction — on a 700k px scroller 6% is
~50 screens, which hid the buttons on exactly the documents that need them.
Pages-view fit-width + zoom preference persist across sessions
(`ps2:preview:zoom`). None of this touches the pagination or export path, so
the v4.4 benchmarks below stand unchanged.

## v4.5 — page-count clarity + pipeline-reuse audit (Phase 7)

No layout-output changes; this phase measured what was already there and
fixed how it is communicated.

1. **The estimate is not the bug — the label was.** The reported symptom
   ("Flow says ≈1005 pages, the PDF is 927") looked like a heuristic
   defect. Re-running `estimatePages` over the exact stress corpora
   (deterministic bodies, real counts 79/193/384/766/751/154) shows the
   prose model is within **±0.5%** at every notes size through 766 pages:

   | Corpus | Estimate | Real | Error |
   |---|--:|--:|--:|
   | notes-100 | 79 | 79 | 0.0% |
   | notes-250 | 194 | 193 | +0.5% |
   | notes-500 | 385 | 384 | +0.3% |
   | notes-1000 | 768 | 766 | +0.3% |
   | qb-1500 | 752 | 751 | +0.1% |
   | qb-300-long | 169 | 154 | +9.7% |

   The only outlier is `qb-300-long`, and it is the tell: a static
   pre-layout heuristic **overshoots** on content that packs better than
   it can foresee — long open-box solutions and dense short callouts fill
   trailing whitespace the estimate charges full price for. The real-world
   1005 → 927 gap (+8.4%) is this same ±10% floor, on a callout-heavy
   notes document. Chasing it by tuning constants would regress the ±0.5%
   cases; the fix is honest labelling, not recalibration. The workspace
   readout now attaches the "≈" to the estimated **total** ("Page 12 /
   ≈480"), not the position, and the exact count — once any layout
   runs — flows into Publish's typesetting progress bar so it drops the
   "≈" and gives a trustworthy ETA.

2. **Pipeline-reuse audit: the export is already single-pagination.**
   `exportPaginatedPdf` transcribes the Publish overlay's laid-out DOM;
   it does not re-run Paged.js. The only double-layout path is
   Pages-preview → Publish (separate iframes), and it is bounded (one
   extra layout, only if the reader opened Pages first). True sharing is
   blocked at the platform level — reparenting an `<iframe>` reloads it,
   destroying the Paged.js layout — so the Pages layout cannot be handed
   to Publish without re-paginating regardless. What *is* reusable and now
   reused is the exact page count (Pages → Publish progress). The lever
   that makes the layout itself incremental is still roadmap item 1
   (chunked/virtualized pagination); nothing cheaper moves it.

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

## Benchmarks (v4.4, production build, headless desktop Chromium)

<!-- BENCH:START -->
| Document | Pages | Paginate | Publish layout | PDF export | PDF size | Fill | DOM nodes | JS heap | Export |
|---|--:|--:|--:|--:|--:|--:|--:|--:|---|
| Notes 100p | 79 | 4.2 s | 3.2 s | 5.2 s | 357 KB | 96% | 10.0 k | 14 MB | ✅ |
| Notes 250p | 193 | 8.3 s | 8.1 s | 13.7 s | 837 KB | 96% | 24.5 k | 27 MB | ✅ |
| Notes 500p | 384 | 21.7 s | 22.9 s | 29.4 s | 1.6 MB | 96% | 48.8 k | 32 MB | ✅ |
| Notes 1000p | 766 | 68.6 s | 84.6 s | 68.5 s | 3.2 MB | 96% | 97.3 k | 61 MB | ✅ |
| QB 1500q | 751 | 67.2 s | 92.4 s | 114.7 s | 5.0 MB | 84% | 112.8 k | 23 MB | ✅ |
| QB 300q, long solutions | 154 | 7.8 s | 7.0 s | 13.4 s | 1.3 MB | 97% | 23.3 k | 16 MB | ✅ |
<!-- BENCH:END -->

v4.3 → v4.4, same scenarios, same environment where measured (the
notes rows were re-measured in both versions this session; the fix is
isolated — TOC page-number resolution only, PDFs byte-identical):

| Document | Paginate v4.3 | Paginate v4.4 | Publish v4.3 | Publish v4.4 |
|---|--:|--:|--:|--:|
| Notes 100p | 6.3 s | **4.2 s (−35%)** | 4.4 s | 3.2 s |
| Notes 250p | 18.4 s | **8.3 s (−55%)** | 19.8 s | 8.1 s |
| Notes 500p | 60.7 s | **21.7 s (−64%)** | 66.1 s | 22.9 s |
| Notes 1000p | 247 s (v4.3 table) | **68.6 s (−72%)** | 272 s | 84.6 s |

Reading the table honestly:

- **Every scenario completes**, including full PDF export at 751–766
  pages. During pagination the main thread is yielded regularly (live
  progress counts, scroll probe gaps of ~17–67 ms at *every* size
  thanks to settled-page `content-visibility`).
- **Notes pagination is now flat ~53–57 ms/page through 500 pages**;
  at 766 pages it averages ~90 ms/page — a mild residual growth from
  Paged.js's own per-page bookkeeping (break-token re-walks, split
  tracking), an order of magnitude better than the ~322 ms/page the
  `target-counter` resolution used to cost there. A Question Bank at
  the same page count runs ~90 ms/page too — notes and banks now share
  the same cost shape, which is the strongest evidence the special
  cause is gone. Only chunked pagination (roadmap 1) moves the
  remaining per-page constant.
- Page counts vary a few percent between browser engine versions (text
  shaping): this environment lays the QB-300 scenario at 154 pages
  where the v4.3 environment measured 168. Within one environment
  counts are deterministic (repeated runs identical), and Pages,
  Publish and the exported PDF always agree exactly — verified by
  parsing the PDFs (79/193/384/766/751/154 pages, equal everywhere).
- JS heap stays ~14–32 MB through 500 pages (~61 MB transient at 1000)
  — memory pressure lives in the renderer's layout tree (DOM nodes
  ~125/page), which `content-visibility` keeps out of the rendering
  pipeline for off-screen pages. Repeated edit→repaginate→export
  cycles return to a flat heap after GC (see "Memory stability").
- **Tablet-class hardware (4× CPU throttle, `CPU_THROTTLE=4`):** the
  250-page notes document paginates in **42 s** (v4.3: 93 s) and the
  300-question bank in 36 s; both export byte-identical PDFs (837 KB /
  1305 KB). Live progress (155/118 events), background-safe
  scheduling, the watchdog and flat-cost scrolling (≤94 ms gaps) all
  hold; this is the measured approximation of the Android Chrome
  production target.

## Optimization history (what already landed)

| Version | Change | Measured effect |
|---|---|---|
| v4.0 | Removed redundant paper-on-paper fills; text-only question header | fewer PDF ops per card, no visual change |
| v4.2 | Markdown parsed once per rebuild (single-entry token memo shared by body render + TOC extraction) | prose rebuild −21…−38% |
| v4.2.1 | Temple mark as one compound `<path>` (was 6 nodes, cloned into every page ×2) | −66% repeated SVG nodes, −8% total DOM, −5% pagination time |
| v4.2.2 | Repeated per-page chrome (watermark/footer temple, social icons) cached as PDF **Form XObjects**, replayed per page | **PDF −30%** on large docs, pixel-identical (diff-verified) |
| v4.3 | Background-safe + cooperative pagination, live progress, watchdog, `content-visibility` on settled pages, QB split-solution contract | large layouts always finish; app stays responsive; QB pages −16% on solution-heavy banks |
| v4.4 | TOC page numbers filled by the harness in one pass (CSS `target-counter` removed — it re-scanned the whole document per page) + layout waits for `document.fonts.ready` | **notes pagination −35/−50/−64% at 100/250/500p, linear ~52–57 ms/page at every size**; byte-identical PDFs; deterministic first-layout metrics |
| v4.4 | Structured-notes page estimate: grounded per-element costs for headings/list items/callouts | heuristic error on structured notes −23% → ±2% (verified at 79/193/384 pages) |
| v4.4 | QB header badges (topic soft pill, source outlined pill), first-line emphasis | pagination time and page counts unchanged; PDF +9% on a 300q bank (1199 → 1305 KB) — accepted for the header hierarchy |

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
- **Pagination time per page.** ~50–60 ms/page is Paged.js's layout
  model (measure content, find break point, build page box). Node-count
  reduction (v4.2.1) shaved ~5%; removing `target-counter` (v4.4) made
  the cost genuinely linear; the per-page constant does not move
  without chunked pagination.
- **Page fill.** Zero blank pages across the suite; content pages
  average ~96% fill on notes and solution-heavy banks, ~84% on
  short-card banks (harness `avgFillPct`, cover/TOC/final page
  excluded) — the atomic-question / keep-with-next contract doing its
  job, see "Smart pagination" below.
- Rejected after measurement (v4.2.1): `text-rendering: optimizeSpeed`
  — zero improvement, typographic risk.

## Smart pagination (whitespace) — contract revised in v4.8

**History.** Up to v4.7 the whole question (header + stem + options) was
one atomic block; measured fill was ~96% on notes, ~97% on
solution-heavy banks, but only ~84% on short-card banks (`qb-1500`) —
at ~2.7 cards/page the page bottom lost about half a card because a
question that didn't fit moved whole. That trade-off was documented
here as "deliberately bounded": splitting was rejected to protect the
exam-book reading contract.

**v4.8 reverses that decision as an explicit product call** — Question
Banks are consulted, not read linearly, and page economy was promoted
to a first-class requirement. The redesign claims the remainder while
repairing the readability cost the old analysis feared:

- The atomic unit shrank to header + stem (`.q__main`); each option row
  stays atomic (`.q__opt`) but the option grid may continue onto the
  next page, and solutions flow as before.
- Every continuation half renders as the established "open book" box
  **plus an absolutely-positioned "Qn · continued" tag** (a pseudo-
  element, materialized into the PDF), so ownership of a continued
  fragment is never ambiguous — the usability objection is addressed,
  not ignored.
- Question Banks additionally get their own tighter `@page` frame
  (`QB_PAGE_MARGINS`) and trimmed page-content padding — a static,
  template-scoped change, so "preview = PDF" identity and the v4.4
  one-pass linearity are untouched (the rejected *adaptive per-page
  compression* stays rejected).
- The optional two-column layout (`qbColumns: 2`) stacks on top for
  short-to-medium banks: measured 108 → 84 pages (−22%) on a
  300-question ultra bank.

Notes and prose templates keep the old margins and the old contract —
nothing outside `tpl-questions` moved.

## Known limitations (honest)

- A 1000-page document is a ~70 s layout on desktop (was ~4 min before
  v4.4), a few minutes on a tablet. It *always finishes* — visibly,
  responsively, interruptibly — but the linear per-page cost remains.
- The QB card estimate (and any static heuristic) carries a ±10%
  environment floor from browser text shaping; the authority chain's
  exact/calibrated tiers absorb it after the first real layout.
- Pagination and PDF transcription run on the main thread by design:
  transcription needs live layout APIs (`getClientRects`), and the
  preview iframe shares the thread. Yielding keeps the app usable.
- The PDF export holds the whole `pdf-lib` document in memory;
  practical ceiling untested beyond ~1000 pages / ~10 MB PDFs.

## Roadmap (priority-ordered, evidence-backed)

1. **Chunked / virtualized pagination** — the only remaining lever on
   the ~50–60 ms/page linear wall (superlinearity is gone as of v4.4).
   Paginate in chapter-sized chunks with yields and a persistent
   page-number offset, or virtualize the page DOM. Session-sized
   redesign of the Paged.js integration + export path; the export
   contract ("what you approve is what you download") must survive it.
2. **`url()`-SVG watermark background** — remove the per-page watermark
   clone from the pagination DOM (needs transcriber `url()`-background
   support first). Smaller win now that settled pages skip rendering.
3. **Web Worker for the Markdown build** — only worthwhile if documents
   grow far beyond 1000 pages; the build is ~0.2 s today.

## Memory stability (long-run probe)

Six consecutive edit → full-repagination cycles plus three consecutive
PDF exports on the 250-page notes document, with forced GC between
cycles (companion probe, this session): post-GC heap goes 13 MB after
the first layout, then 17 · 17 · 18 · 18 · 18 · 18 MB across the six
repagination cycles — a plateau, not growth. Repagination rebuilds the
iframe from scratch (srcdoc swap), so the previous layout tree,
Paged.js state and engine buffers are torn down wholesale rather than
retained; repeated exports likewise return to the plateau once the
transient `pdf-lib` document is released.

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
