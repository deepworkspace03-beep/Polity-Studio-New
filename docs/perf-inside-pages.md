# Inside-page rendering cost — review & baseline (v4.0)

A focused review of what every *content* page (not the cover) costs to
lay out, preview and transcribe into the PDF. Implemented wins are
listed first; everything else is documented here deliberately — with
root cause, cost and a recommendation — as the baseline for the
upcoming 1000-page stress-testing / optimization session.

## Implemented in v4.0 (zero visual change)

1. **Redundant paper-on-paper fills removed.** `.q` (question card),
   `.key__cell` (answer-key cell) and the old flashcard card painted
   `background: var(--c-mix, white)` — a color identical to the page's
   own `--c-paper` in *both* themes (`#FFFFFF` light / `#0F141B` dark).
   Every such fill is one rounded-rect path + fill operation per element
   in the exported PDF and one paint layer in the preview; a 1000-question
   bank paid ~1000 of them for zero visible effect. The new
   `questions.css` simply omits the background.
2. **Question-card header is text-only.** The old topic/source/marks
   chips were bordered, filled pills (3 rounded rects + 3 strokes + 3
   fills per question). The redesigned header row (number · topic ·
   source) keeps one filled badge (the number) and renders topic/source
   as plain text runs — fewer DOM nodes, fewer PDF operators, and it
   matches the professional exam-book look.

## Reviewed and deliberately kept (visual quality > bytes)

- **Per-page watermark** (`.page-watermark`, cloned by the harness onto
  every content page): one temple-mark SVG (~10 path elements) + one
  text run per page. It is the brand feature; dropping or rasterizing it
  would reduce quality. Cost is linear and modest (~1–2 KB/page in the
  PDF). *1000-page note:* the SVG transcription work is identical on
  every page — the transcriber could cache the watermark's PDF operator
  block after the first page and replay it (same for the footer lockup
  and social icons). This is the single best per-page win available and
  belongs in the optimization session (touches `engine/transcribe.ts`).
- **Footer brand lockup + 2 social-icon SVGs per page** — same shape as
  the watermark: visually required, mechanically repeated, cacheable in
  the same way.
- **Header/footer hairline rules and page-number text** — one stroke and
  one text run per page; negligible.
- **`.pagedjs_pagebox { background: var(--c-paper) }`** — a full-page
  fill per page. In the light theme this paints white on an already
  white PDF page. It must stay for the dark reading theme and for
  on-screen preview correctness; the engine could skip fills whose color
  equals the PDF page default. Micro-win; optimization-session material.

## Known structural costs (documented for the 1000-page session)

- **Paged.js margin boxes:** every page carries ~16 margin-box DIVs plus
  the cloned running elements. This is inherent to the Paged.js page
  model and is the main DOM-size driver on huge documents (preview
  memory, layout time). Not fixable from CSS; any mitigation (virtualized
  preview, chunked pagination) is a session-sized project.
- **`text-rendering: optimizeLegibility`** (print-base body rule) makes
  Chrome fragment text runs at kerning-cluster boundaries, which the
  transcriber must detect and handle (see the wrapped-run logic in
  `engine/transcribe.ts`). Removing it would speed up `getClientRects`
  measurement slightly but changes kerning everywhere — visual risk, not
  worth it without side-by-side inspection during the perf session.
- **Per-word `Range.getClientRects()` measurement** in the transcriber
  is the dominant export cost (~linear in words). The font-face memo
  already removed the per-character microtask storm; the next win is the
  repeated-chrome caching noted above, then possibly batching range
  measurements per text node.
- **Data-URI images** ship base64 in the document body and are re-decoded
  per preview rebuild; the PDF path already downscales to ≤2× display
  size. Fine at current scale; watch memory on image-heavy 1000-page
  documents.

## Where the next session should start

1. Cache the transcribed operator block for per-page repeated chrome
   (watermark, footer lockup, social icons) in `engine/transcribe.ts`.
2. Measure pagination + export on a synthetic 1000-page Question Bank
   (the generator can live in the verify skill) before touching anything.
3. Only then consider Paged.js-level work (chunking, virtualization).

## Update — v4.2 large-document session

The 1000-page session ran (2) end to end and is written up in
[`perf-1000-page-session.md`](./perf-1000-page-session.md): a measured
before/after for the build stage and real browser-side pagination/export
numbers. It landed the build-stage win (parse the body once per rebuild —
the TOC no longer triggers a second full parse) and confirmed with data
that the true wall is browser-side pagination (~60–75 ms/page), not the
build pipeline (~170 ms at 1000 pages).

Item (1) here — Form-XObject chrome caching — **landed in v4.2.2 (Phase 3**,
see [`perf-1000-page-session.md`](./perf-1000-page-session.md)): the
watermark/footer temple and social icons are now cached as reusable PDF Form
XObjects and replayed per page, cutting exported PDF size ~30% with
pixel-identical output. The remaining top item is the *browser-side* one —
moving the watermark to a `url()`-SVG CSS background to cut per-page
pagination DOM — which still needs transcriber `url()`-background support
first, then chunked/virtualized pagination for the ~70 ms/page wall itself.
