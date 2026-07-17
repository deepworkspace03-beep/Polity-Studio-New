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
