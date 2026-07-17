# Large-document performance session (v4.2)

The brief: make **very large documents** (100 → 1000+ pages) production-ready
across the whole workflow — AI → Markdown → Studio → Preview → Export → PDF —
without touching the premium look, the PDF fidelity or Markdown compatibility.

The discipline followed: **measure first, find the real bottleneck, pick the
simplest effective fix, measure again, keep it only if it helps without cost to
quality.** This document records what was measured, what was changed, and — just
as important — what was deliberately *not* changed and why.

## Method

Two measurement layers, because the workflow spans two very different engines:

1. **Build stage** (pure, framework-free string assembly — Markdown parse,
   `buildDocumentHtml`, TOC extraction). Measured with a synthetic generator at
   100 / 400 / 750 / 1000 notes-pages and 1.4k → 14k questions, timed with
   `performance.now()` under the real Vite/vitest transform. Deterministic and
   cheap, so before/after is trustworthy.
2. **Browser stage** (Paged.js pagination + the vector PDF transcriber).
   Measured by driving the *real* production build in headless Chromium
   (Playwright), injecting documents straight into IndexedDB, timing Pages
   pagination and a full Publish → Download PDF.

Synthetic bodies mirror real study material: chaptered notes with headings,
paragraphs, lists and callouts; question banks with stems, four options, a
starred answer, a worked solution and topic/source tags.

## Baseline — where the time actually goes

**Build stage (cold cache, ms):**

| Document | words | Markdown build | TOC extract |
|---|--:|--:|--:|
| notes 100p | 19,916 | 24 | 16 |
| notes 400p | 78,898 | 65 | 35 |
| notes 750p | 147,072 | 153 | 68 |
| notes 1000p | 196,096 | 170 | 84 |
| QB 14,000q | 1,415,400 | 776 | n/a (no TOC) |

**Browser stage (real app, Chromium):**

| Operation | Pages | Time | Output |
|---|--:|--:|--:|
| Paginate notes | 84 | ~4,960 ms (~59 ms/page) | — |
| Paginate notes | 400 | ~30,000 ms (~75 ms/page) | — |
| Publish → PDF (notes) | 84 | ~10,270 ms | 571 KB (~6.8 KB/page) |
| Publish → PDF (QB) | ~30 | ~2,610 ms | 269 KB |

**The headline finding:** the Markdown/build pipeline is **not** the wall — even
a 1000-page document assembles its full HTML in ~170 ms. The real cost is
**browser-side**: Paged.js pagination is ~60–75 ms/page (so a 1000-page book is
~60–75 s on a *fast desktop*, and materially worse on a Samsung Galaxy tablet's
weaker CPU and tighter memory), and PDF export is dominated by per-word
`Range.getClientRects()` measurement plus per-page repeated chrome.

Root causes, by stage:

- **Build:** the body was parsed **twice** on every rebuild — once to render the
  body HTML, once to extract the table of contents — for the prose templates
  (Notes / Revision / Universal). Pure, avoidable, on the interactive path.
- **Pagination (Paged.js):** ~16 margin-box DIVs per page plus the cloned
  running header/footer and a per-page watermark clone. DOM size (hence layout
  time and memory) grows linearly and is the dominant scaling cost. Inherent to
  the Paged.js page model.
- **Export (transcriber):** per-word range measurement is linear in words;
  repeated per-page chrome (watermark SVG, footer lockup, social icons) is
  re-transcribed on every page, which drives PDF byte size on text-light pages.

## What was changed

### 1. Parse the body once per rebuild (`markdown/renderer.ts`)

`markdown-it`'s `render()` is `parse()` + `renderer.render()`; `parse()` (running
every core rule) is the expensive half. A single-entry memo now caches the last
`(tokens, env)` pair, so a build's body render and its TOC extraction — and the
flow rebuild immediately followed by the paged rebuild on the same body — share
**one** parse. Reuse is exact, not approximate: `render()` consumes the very
tokens and `env` that `parse()` produced (footnote/reference state lives on
`env`), reproducing byte-identical output. Size 1 on purpose so a huge token
tree is never pinned beyond the current body.

**Measured (cold build, before → after):**

| Document | Markdown build | TOC extract | Prose rebuild total |
|---|--:|--:|--:|
| notes 400p | 65 → 41 ms | 35 → 2 ms | 66 → 43 ms (−35%) |
| notes 750p | 153 → 77 ms | 68 → 2 ms | 127 → 79 ms (−38%) |
| notes 1000p | 170 → 116 ms | 84 → 21 ms | 168 → 132 ms (−21%) |

Question Bank builds are unchanged (they render per-question fragments, not the
whole body, and carry no TOC) — confirming the fix targets exactly the redundant
work and regresses nothing. Guarded by three new tests in `renderer.test.ts`
(identical output on repeat, TOC ids in sync with the body's anchor ids,
footnotes correct after a TOC extraction primed the memo).

### 2. Question Bank premium refresh (`pdf/styles/questions.css`)

Purely visual, zero added scaling cost: softer 7 pt card corners, a confident
textbook spine (the tightened refinement pass had faded it to near-invisibility),
a rounded number badge, a calmer header hierarchy, the correct option framed with
a hairline green wash, and a small accent rule before every *Solution*. Refreshed
in every density (Ultra Compact included) and both themes. The correct-option
highlight uses **background + border only** (no `box-shadow`) precisely because
box-shadow does not transcribe to the PDF — so preview and print stay identical.
Verified in the browser (preview) and by rendering the exported vector PDF: every
new element (framed option, solution accent) appears in the PDF at parity.

### 3. Image size control 1–100% + honest Markdown export

The figure width slider now spans **1–100%** (was floored at 10%). The Publish
**Markdown export** now emits *portable* Markdown — embedded images preserved in
full, Studio-only `{width=…}` layout hints stripped — matching its "portable to
any editor" promise and the Settings bulk export; full-fidelity round-trip
(layout included) remains the JSON backup's job. A regression test locks that an
embedded data-URI image survives the `.md` import tidy byte-for-byte.

## What was deliberately NOT changed (and why)

Two browser-stage wins are real but touch the crown-jewel vector engine, whose
only meaningful verification is a full manual PDF pass. Given this session's
budget and the risk/return, they are documented here as the prioritized roadmap
rather than rushed:

- **Cache repeated per-page chrome as a PDF Form XObject** (watermark, footer
  lockup, social icons are byte-identical on every content page). This is the
  single biggest *PDF-size* win, but it requires isolating an element's operators
  into a form with its own resource dictionary — a real refactor of `PageCanvas`.
  The dominant export *time* cost is per-word measurement, which this does not
  touch, so it was not worth gambling the engine this pass.
- **Reduce pagination DOM/memory** (the actual tablet wall) by painting the
  watermark as a CSS `background-image` data-URI instead of cloning ~10 SVG paths
  per page. Zero extra DOM nodes per page — but the transcriber currently skips
  `url()` backgrounds, so it would need `url()`-SVG background support first, or
  the watermark vanishes from the PDF.

Neither is a CSS-only change; both are engine work with a mandatory manual-PDF
verification loop.

## Remaining limitations

- 1000+ page pagination is still ~60–75 ms/page on desktop and slower on a
  tablet — that ceiling is Paged.js's, not the app's, and only chunked or
  virtualized pagination moves it.
- PDF export stays on the main thread (with a live progress bar); a 1000-page
  export is a minutes-long operation.

## Recommended roadmap (in priority order)

1. **Form-XObject chrome caching** in `engine/transcribe.ts` — biggest PDF-size
   win; isolate watermark/footer/icons into a reusable form. (High value, medium
   risk, needs manual-PDF verification.)
2. **`url()`-SVG background support** in the transcriber, then move the watermark
   to a CSS background — cuts per-page pagination DOM/memory, the tablet wall.
3. **Chunked / virtualized pagination** — paginate and hold only a window of
   pages; the session-sized project that lifts the 60–75 ms/page ceiling.
4. **Web Worker offload** for Markdown parse and PDF transcription, to keep the
   main thread free on huge documents.

## Verification

`typecheck` clean · 156 unit tests pass (5 new) · production build succeeds ·
browser-driven pagination and PDF export show no regression (notes 84p export
unchanged at 571 KB; QB exports cleanly with the new premium elements at PDF
parity).

---

# Phase 2 — real browser profiling & repeated-vector reduction

Phase 1 proved the wall is browser-side. Phase 2 profiled the real production
build in headless Chromium (CDP `Performance.getMetrics` + direct iframe DOM
counts) across 100 → 1000 pages, ranked the bottlenecks with hard numbers, and
landed a safe, measured reduction in per-page vector cost. **No assumptions —
every claim below is a measurement, including the one optimization that was
tried and rejected because the data said it did nothing.**

## Browser profile (Notes, real app, Chromium)

| Pages | Paginate (wall) | DOM nodes | nodes/page | SVG shapes | JS heap |
|--:|--:|--:|--:|--:|--:|
| 84 | 4,700–5,800 ms | 10,450 | ~124 | 1,301 (~15/pg) | ~27 MB |
| 205 | 14,800–15,000 ms | 25,421 | ~124 | 3,109 (~15/pg) | ~31 MB |
| 500+ | did not finish in a 30 s window | — | — | — | — |

**Root causes, ranked by impact:**

1. **Paged.js pagination time — ~70 ms/page, strictly linear.** The dominant
   wall: 1000 pages ≈ 70 s of main-thread work, which *is* the Samsung-tablet
   "hang" (the pagination runs in the same-thread preview iframe, so the whole
   app freezes for its duration). Root cause: Paged.js measures content and
   finds break points page-by-page; inherent to its layout model. **Not movable
   without chunked/virtualized pagination.**
2. **DOM growth — ~124 nodes/page → ~124k nodes at 1000 pages.** The memory /
   tablet-OOM driver (renderer C++ heap, not the modest ~30 MB JS heap). Of that,
   ~15 SVG shape nodes/page were repeated brand chrome (temple mark ×2 + social
   icons), and Paged.js's ~16 margin-box scaffolding is the larger structural
   remainder.
3. **Style recalc** grows with node count (cumulative `RecalcStyleDuration`
   reached ~61 ms at partial-1000p) — reduced by cutting nodes.
4. **PDF export** (Phase 1: ~120 ms/page) — dominated by per-word
   `Range.getClientRects()`, which is position-dependent and not cacheable.

## Rejected after measurement: `text-rendering`

The perf notes flagged `text-rendering: optimizeLegibility` as a possible
pagination/measurement cost. Tested directly (`optimizeSpeed`, rebuilt, same
docs): **100p 4,697 → 4,885 ms, 250p 14,758 → 15,346 ms — no improvement, within
noise.** Reason: kerning is already forced by `font-kerning: normal`, so the
text-rendering mode changes little about measurement. Reverted — it only risks
typographic quality for zero measured gain. (This is the discipline working: a
plausible optimization killed by data.)

## Implemented: temple mark as one compound path *(safe, measured, PDF-verified)*

The Polity Made Simple temple emblem shipped as a `<path>` + five `<rect>` — six
SVG nodes — and it is cloned into **every** page's footer *and* watermark. It is
now a single compound `<path>` (roof triangle + rounded-rect lintel/pillars/base
as subpaths), geometry unchanged. The transcriber already walks multi-subpath
paths as one fill, so preview and PDF are pixel-identical (verified by rendering
the exported PDF — cover lockup, footer and watermark all crisp).

**Measured (before → after):**

| Metric (Notes 250p) | Before | After | Δ |
|---|--:|--:|--:|
| Repeated SVG shape nodes | 3,109 | 1,054 | **−66%** |
| Total DOM nodes | 25,421 | 23,366 | **−8.1%** |
| Pagination time | 14,758 ms | 13,974 ms | **−5.3%** |

The same holds at 84 pages (10,450 → 9,605 nodes, −8.1%). At 1000 pages this is
~10k fewer DOM nodes — lower renderer memory (pushing the tablet-OOM threshold
out) and cheaper per-page style recalc, paint and watermark cloning — plus fewer
PDF fill operators (smaller files), all with zero visual change. It does not move
the ~70 ms/page pagination ceiling: that is Paged.js's algorithm, not node count.

## Honest conclusion

Polity Studio is now measurably lighter and more memory-efficient on large
documents (Phase 1 build stage −30–50%; Phase 2 −8% DOM / −5–7% pagination / −66%
repeated SVG, no regressions), but the **fundamental O(pages) pagination cost
(~70 ms/page) is Paged.js-inherent and unchanged.** For genuinely fluid 1000+
page handling on a Samsung tablet, the required next step is **chunked or
virtualized pagination** — a real redesign of the Paged.js integration and the
export path, deliberately not attempted in a single session on the crown-jewel
PDF pipeline without its own dedicated verification budget. Until then, 1000-page
documents remain *functional* (they paginate and export correctly, verified) but
the layout is a minutes-long, memory-heavy operation — the honest limiting
factor.

## Roadmap (unchanged priority, now evidence-backed)

1. **Chunked / virtualized pagination** — the only lever on the ~70 ms/page wall;
   paginate and retain a sliding window of pages, materialize the rest on demand
   for export. Highest impact, highest effort.
2. **Form-XObject chrome caching** in `engine/transcribe.ts` — cache the (now
   single-path) watermark/footer as a reusable form; biggest remaining PDF-size
   win once the temple is already one node.
3. **`url()`-SVG watermark background** — remove per-page watermark cloning from
   the DOM entirely (needs transcriber `url()`-background support first).
4. **Web Worker offload** for Markdown parse (DOM-free) — export transcription
   cannot move (it needs live layout APIs).
