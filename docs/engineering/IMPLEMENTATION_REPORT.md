# Implementation Report — v3.1.0 engineering pass

Self-contained record of a large engineering pass over Polity Studio.
Written so a future AI session (Claude, ChatGPT, Gemini, or otherwise)
can understand what changed, why, and what's still open, without
reading the conversation that produced it. Pair with
[HANDOVER.md](./HANDOVER.md) (what to do next) and
[CHANGELOG.md](../../CHANGELOG.md) (high-level version history).

## Scope

An extended improvement brief covering: PYQ/MCQ layout, export
optimization, cover/PDF design, the three-pane workspace, editor
toolbar, document-type consolidation, dark theme, image layout, PWA/
offline support, and PDF↔HTML rendering fidelity — followed by a
regression audit that found and fixed three real bugs the fidelity/
perf work itself introduced. See `ARCHITECTURE.md` and `AI_GUIDE.md`
for the codebase's permanent documentation (this file is a point-in-
time report, not living documentation — don't extend it going
forward, extend those files instead and log the milestone in
`CHANGELOG.md`).

## What changed, by area

**PYQ/MCQ (`src/markdown/mcq.ts`, `src/templates/index.ts`,
`src/lib/questionText.ts`)** — compact single-line question header
(number · unit/topic · source); duplicate "Answer:"/"Correct Answer:"
lines stripped on import; no solution-length limit; a small ✓ on the
correct option instead of a separate answer block; `topicRevealsAnswer()`
hides a topic label when it would give away the answer.

**Cover design (`src/pdf/document.ts`, `src/pdf/styles/covers.css`,
`src/brand/marks.ts`)** — Ultra-Compact density tier; Session/Edition
split, with Edition as a small badge pinned to the cover's extreme
top-right corner (`position: absolute`, inset within the safe margin,
`.cv-edition-badge`), independent of the Session pill; four-state
Language badge (Hindi/English/Both/None) moved to the footer
(`.cv-foot__lang`); lighter cover patterns (`coverPatternSvg()`,
opacity reduced ~20-25%, "weave" replaced with a gentle wave curve).

**Document model (`src/lib/types.ts`, `src/lib/store.ts`,
`src/templates/*.ts`)** — five templates consolidated to four: Notes,
Question Bank (MCQ+PYQ unified), Revision (Quick Revision + Flash
Cards unified, `layout.revisionStyle: "summary" | "cards"`), Universal
(brand-neutral). `normalizeDoc()`/`LEGACY_TEMPLATES`/
`LEGACY_TEMPLATE_LAYOUT` migrate existing stored documents
automatically — this is exercised by `store.test.ts`.

**Editor toolbar (`src/views/editor/Toolbar.tsx`,
`src/views/editor/commands.ts`)** — every action has a tooltip +
touch long-press hint; Smart Format (`smartFormatDocument()` in
`lib/importer.ts`) normalizes messy pasted/AI-generated Markdown;
Replace-from-Clipboard with a confirm step; an Editor Toolbar Guide in
Help.

**Three-pane workspace (`src/views/editor/Details.tsx`)** — Cover
Designer and a new PDF Designer (typography, density, page size, TOC,
watermark, answers placement) are separate collapsible
`<Disclosure>` sections instead of one long scroll.

**Image layout (`src/views/editor/commands.ts`,
`src/views/editor/Toolbar.tsx`)** — an align/width popover for images;
`findImageAtCursor()`/`setImageLayout()` read and rewrite the
`{width=…% align=…}` Markdown attribute syntax the renderer already
understood.

**Export pipeline (`src/pdf/htmlExport.ts`)** — the standalone HTML
export inlines only the font faces the document actually uses (script-
gated + per-element usage-gated, see `usedFaceKeys()`), cutting export
size substantially versus shipping the full bundled font set.

**PWA/offline (`public/sw.js`, `src/lib/pwa.ts`,
`src/components/UpdateBanner.tsx`)** — a hand-rolled service worker:
network-first navigations with a cached-shell fallback, cache-first
hashed assets, install-time app-shell precache (so the app works
offline after one online visit, not two). A found-and-fixed bug:
`registerServiceWorker()` originally waited on the `window` `load`
event via `addEventListener`, but since it's called from a React
effect that mounts after hydration, `load` had almost always already
fired — the listener never ran and the service worker silently never
registered. Fixed by checking `document.readyState === "complete"`
first.

**HTML↔PDF fidelity (`src/pdf/htmlExport.ts`,
`src/pdf/engine/transcribe.ts`)** — two real, verified bugs, found
using user-supplied reference HTML/PDF exports of the same document:

1. *Broken TOC/chapter counters in the standalone HTML export.*
   Paged.js resolves `target-counter()`/chapter-number counters in its
   own JS runtime during layout and strips the native CSS
   `counter-reset`/`counter-increment` once resolved — invisible in
   the live preview (which reads the live, still-running document),
   broken in a reopened static file (every TOC entry showed page "0",
   every heading "Chapter 0"). Fixed by reusing the PDF engine's own
   counter resolver (`engine/materialize.ts`'s `resolveContent`) to
   bake literal values into scoped CSS before serializing
   (`bakeGeneratedCounters()`).
2. *PDF kerning drift.* `pdf-lib`'s text layout uses the font's raw,
   un-kerned advance widths — it doesn't replay GPOS kerning pairs the
   way the browser does. Measured directly: "To" rendered 2.64px wider
   in the PDF than the browser at 44pt (Literata Bold), "Ta" 2.2px
   wider, because a capital "T" before a lowercase vowel is one of the
   most aggressively kerned pairs in Latin type — and one of the most
   common first-word patterns in English headings. Fixed by comparing
   `pdfFont.widthOfTextAtSize()` against the browser's measured rect
   width and falling back to per-character positioning (which already
   existed, for letter-spaced runs) on divergence.

**Regression audit (same session, after the above)** — the two
fidelity fixes above, and Improvement 10's PWA precache, together
introduced three real regressions, found and fixed in a follow-up
audit pass:

1. *PDF export size/speed regression.* The kerning check (bug #2
   above) compared *whole-run* predicted width against the browser's
   width, but divergence accumulates with a run's length regardless of
   visual significance — "Fundamental" (11 letters, no single dominant
   pair) measured similar total divergence to "To" despite looking
   fine, so the check sent most multi-syllable words through the
   character-by-character path (one PDF operator per character
   instead of one per word). Fixed by scoping the check to runs ≤6
   characters — long enough to catch a dominant pair, short enough to
   exclude words where divergence dilutes into imperceptibility.
2. *HTML export hang on large documents.* The counter baker (bug #1
   above) called `getComputedStyle` twice per element across *every*
   element on every page — cheap on the 10-page document this session
   tested against, but scales with total element count, not with how
   many elements actually reference a counter. Every `counter()` in
   the whole codebase's CSS is confined to 4 known selectors (chapter
   heading, TOC entry, TOC page-reference, running footer). Fixed by
   scoping the scan to those selectors only.
3. *Broken counters when PDF exports before HTML in the same
   session.* The counter baker read computed pseudo-element style
   *through* the PDF engine's own `materializePseudos` disabling
   stylesheet (`content: none !important` on every pseudo, applied
   during PDF export), silently baking nothing. Fixed by moving the
   existing "undo materialization" cleanup from after the HTML export's
   clone step to before the counter bake, on the live document.

Also fixed: the Settings → Your data storage-usage label
(`navigator.storage.estimate()`) reads as "total app storage" but was
worded "~X of browser storage in use" right next to the document
count — easy to misread as document size. Since this session's PWA
work added a ~2.3MB precached app shell to that same total, a 150KB
document could show as "2-3MB," which is exactly what was reported.
Nothing leaked; the number just started including something that used
to be near-zero. Relabeled for clarity in `src/views/Settings.tsx`.

**Visual regression benchmark (`scripts/visual-regression.mjs`,
`scripts/visual-baseline/`)** — opt-in (`npm run test:visual`), not in
CI. Builds the app, exports the built-in "Fundamental Rights" demo to
PDF and standalone HTML, checks page-count agreement across the live
preview/PDF/HTML (a reliable proxy for "did pagination break" — full
pixel-diffing Blink's HTML layout against PDFium's PDF rendering isn't
practical to keep false-positive-free), and pixel-diffs each PDF page
(via Chromium's own PDF viewer) against a committed baseline. The 3%
per-page tolerance was calibrated empirically against measured
cross-build PDFium anti-aliasing jitter (0.2-1.7%) and a deliberate
test regression (6-10%+). **Known stale**: the baseline was captured
before the regression-audit fixes above changed the PDF's rendered
pixels (fewer runs now take the character-by-character path); running
`npm run test:visual` will show diffs until it's refreshed with
`--update`. This is expected, not a new bug — see HANDOVER.md.

## Verification performed

- `npm run typecheck`, `npm test` (114 tests), `npm run build` all
  clean at every commit in this pass.
- Playwright-driven end-to-end passes: template creation, typing,
  Publish, PDF/HTML download, offline reload (service worker install →
  precache → `context.setOffline(true)` → reload → app still renders),
  all with zero console/page errors.
- The two fidelity bugs and the three regressions were each verified
  with before/after measurements (byte-level HTML diffs, PDF page
  render screenshots via Chromium's built-in viewer, direct
  `pdf-lib`/`fontkit` width measurements), not just "looks right."

## What was NOT done, and why

- **Code Workspace** (a secondary IDE-like mode) — the master prompt
  this session worked from explicitly permitted deferring it if it
  "would significantly increase complexity." A sandboxed live-preview
  execution surface is a genuinely new, security-sensitive subsystem,
  not an extension of the publishing pipeline.
- **DOCX/EPUB/ODT export** — the existing PDF/HTML/Markdown trio
  covers the practical needs; a real writer for any of these is a
  nontrivial new dependency with no current demand, against the
  project's "few, intentional dependencies" convention.
- **Granular per-role PDF color pickers** (independent heading/body/
  link/table colors) — the existing brand-color cascade (primary/
  accent/gold → CSS custom properties) already drives all of those
  roles coherently; fragmenting it into many independent controls was
  judged complexity without a clear win.
- **Live large-document (100+ page) stress testing** — all testing in
  this pass used the 10-page "Fundamental Rights" demo. The regression
  audit's root-cause analysis for the size/speed/hang regressions was
  derived from direct code reading and targeted measurements (kerning
  divergence data, `getComputedStyle` call counts), not a live 100+
  page profiling run — that's the highest-value next validation step
  if further issues surface. See HANDOVER.md.

## File inventory (new/significantly changed this pass)

```
public/sw.js                          service worker (new)
src/lib/pwa.ts                        SW registration (new)
src/components/UpdateBanner.tsx       update prompt UI (new)
src/pdf/htmlExport.ts                 counter baking + font filtering (new logic)
src/pdf/engine/transcribe.ts          kerning-divergence fallback (new logic)
src/pdf/engine/materialize.ts         generated-content resolver (pre-existing, now reused by htmlExport.ts too)
src/pdf/styles/question-bank.css      MCQ+PYQ merged (was mcq.css + pyq.css)
src/pdf/styles/revision.css           + flashcards.css merged in
src/lib/types.ts, src/lib/store.ts    4-template model + migration
scripts/visual-regression.mjs         visual regression runner (new)
scripts/visual-baseline/*.png         committed baseline (new, stale — see above)
CHANGELOG.md                          new
docs/engineering/                     this report + HANDOVER.md (new)
```
