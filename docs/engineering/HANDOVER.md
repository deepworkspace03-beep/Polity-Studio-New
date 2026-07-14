# Handover

For the next AI session (or human) picking this up cold. Read
[IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) for what
changed and why; this file is "what to do next," ranked.

## State right now

Working tree is clean. `npm run typecheck`, `npm test` (114 tests),
and `npm run build` all pass. Everything described here is committed
and pushed to `claude/polity-studio-production-ks5140`.

## Priority 1 — refresh the visual regression baseline

`scripts/visual-baseline/*.png` was captured *before* the regression-
audit fixes (see IMPLEMENTATION_REPORT.md's "Regression audit"
section) changed which text runs take the character-by-character PDF
draw path. Running `npm run test:visual` right now will report diffs
that are **expected**, not new bugs — the underlying rendering is
correct (verified separately via direct measurement), the baseline
images just predate the fix. Refresh with:

```bash
npm run test:visual -- --update
```

Then visually spot-check a few `scripts/visual-baseline/*.png` files
before committing — confirm text still looks right (no clipping,
correct kerning on headings like "The Right to...") and commit the
refreshed PNGs. This is 5 minutes of work; do it before relying on
`test:visual` for anything else.

## Priority 2 — validate on a large (100+ page) document

Every fix and every test in this pass used the built-in 10-page
"Fundamental Rights — Complete Notes" demo (Library → Examples). The
regression audit's root causes (kerning-check cost, `getComputedStyle`
scan cost) were diagnosed by reading code and measuring in isolation,
**not** by profiling a large document end-to-end — that's the
highest-value thing to do next if performance is still a concern:

1. Build a large test document — duplicate the demo's Markdown body
   content ~8-10x with distinct headings (`## Chapter N — <original
   section>`) to simulate ~80-100 pages, or paste in real course
   material if available.
2. Time `Download PDF` and `Download HTML` from the Publish view
   (Chrome DevTools Performance tab, or wrap the calls in
   `console.time`/`console.timeEnd` temporarily in `Publish.tsx`).
3. If export is still slow (more than a few seconds for 100 pages),
   profile with DevTools to find the actual hot function rather than
   guessing — the font-resolution memo in `pdf/engine/fonts.ts`
   (`FontResolver.cached`/`.resolve`) and the per-character loop in
   `transcribe.ts`'s `emitText` are the most likely remaining
   candidates, since they run once per character across the whole
   document.
4. If editor/settings responsiveness (not export) is the complaint,
   profile a **live edit** in a large document, not a export — Paged.js
   re-pagination cost (`AI_GUIDE.md`'s Performance notes: "~5s for
   very large documents") is a known, pre-existing characteristic of
   the library, not something this pass touched. Confirm whether it's
   within that documented range or has regressed before assuming a new
   bug.

## Priority 3 — the deliberately-deferred features

If the project owner asks about Code Workspace, DOCX/EPUB export, or
granular PDF color controls: these were evaluated and explicitly
deferred this pass (reasons in IMPLEMENTATION_REPORT.md). Don't
re-litigate the decision from scratch — read that section first, then
build only if there's now a concrete, real usage need driving it (per
this project's own stated preference: features should come from real
usage, not speculative engineering).

## Conventions this codebase expects

- `npm run typecheck && npm test && npm run build` must all pass
  before any change is considered done. `npm run test:visual` is
  opt-in and not part of that gate (see AI_GUIDE.md § Testing).
- New optional `Doc`/`DocLayout` fields **must** be added to
  `DOC_OPTIONAL_KEYS`/`LAYOUT_OPTIONAL_KEYS` in `lib/store.ts` or they
  silently vanish on reload — this has bitten this project before,
  there's a regression test for it in `store.test.ts`.
- No new dependency without checking `ARCHITECTURE.md` § design
  decision 7 first. This pass added `playwright`, `pixelmatch`,
  `pngjs` — all dev-only, gated behind the opt-in visual-regression
  script, never touching the shipped bundle. That's the bar: dev
  tooling is fine, anything in the editor/preview/export hot path
  needs a much stronger justification.
- If you touch `pdf/engine/`, `pdf/document.ts`, or `pdf/styles/*.css`,
  run `npm run test:visual` before considering the change done (after
  Priority 1's refresh) — that's exactly the class of change it exists
  to catch.
- Read `AI_GUIDE.md` § Common pitfalls before touching font loading,
  the question-bank parser, or dialog focus handling — several
  non-obvious bugs are already documented there with their fixes.

## If something seems broken and you're not sure why

Don't assume — measure. This pass's two most valuable findings (the
kerning-threshold regression, the `getComputedStyle` scan cost) both
came from reading the actual code and running small, targeted
measurements (a standalone `pdf-lib`/`fontkit` script comparing
predicted vs. actual glyph widths; a `console.error` call count
temporarily added to a loop), not from guessing based on symptoms.
Both bugs would have been easy to misdiagnose from symptoms alone
("PDF export is slow" could plausibly have been blamed on font
subsetting, image encoding, or a dozen other things). When in doubt,
add a cheap, temporary measurement, get a real number, then fix what
the number points at — and remove the instrumentation before
committing.
