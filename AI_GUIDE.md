# AI Development Guide

Practical, operational knowledge for working on this repo with an AI
coding assistant (Claude, ChatGPT, Gemini, or otherwise). Read this
**first** for "how do I work here"; read [ARCHITECTURE.md](./ARCHITECTURE.md)
for "why is this built this way" — this file deliberately doesn't repeat
its design-decision writeups, only points at them.

## 30-second orientation

Polity Studio is a **client-only, static React/TypeScript SPA**: no
server, no API, no database beyond the browser's own IndexedDB. It turns
Markdown into branded, print-quality PDFs entirely in the browser, via a
hand-rolled vector PDF engine (`src/pdf/engine/`) that transcribes a
Paged.js-paginated DOM into `pdf-lib` output. If you're about to reach
for a backend, a server, or a new heavy dependency, stop — that almost
certainly isn't the right move here (see ARCHITECTURE.md § design
decisions 1 and 7).

## Folder responsibilities

See ARCHITECTURE.md § Folder map for the exhaustive, file-by-file
listing. The one-line version:

| Folder | Owns |
|---|---|
| `src/lib/` | Framework-free domain logic: types, storage, import/paste parsing, search, utils. No React, no DOM rendering. |
| `src/brand/` | Default branding data + the inline-SVG marks (temple, social icons, watermark). |
| `src/markdown/` | The markdown-it pipeline (renderer.ts) and the MCQ text dialect parser (mcq.ts). |
| `src/templates/` | Per-document-type registry: metadata, starters, demo content, body builders + print CSS. |
| `src/pdf/` | The document builder (`document.ts`, one function feeds preview/paged/export), iframe harness scripts, the vector PDF engine, print stylesheets. |
| `src/components/` | Shared, reusable UI (Button, Modal, Toast, CommandPalette, ImportReview) — no document-domain knowledge. |
| `src/views/` | The four routed screens (Library, Editor, Settings, Help) and the Editor's own sub-views. |

## Document flow (the thing that matters most)

```
Doc + BrandConfig + theme
        │
        ▼
buildDocumentHtml()  (src/pdf/document.ts — pure string assembly, no DOM)
        │
        ├─→ Flow preview iframe   (continuous, live-typing, inline edit)
        ├─→ Pages preview iframe  (Paged.js pagination, what Publish shows)
        └─→ Publish/export iframe (identical to Pages — "what you approve
             is what you download")
                  │
                  ▼
        exportPaginatedPdf()  (src/pdf/engine/ — walks the *laid-out* DOM,
                                replays it as vector PDF operators)
```

One function (`buildDocumentHtml`) is the single source of truth for all
three consumers. If you're fixing a rendering bug, fix it there (or in
the template body builder / print CSS it assembles) — never patch a
symptom inside the preview or the PDF engine alone, or preview and export
will drift apart.

## Conventions

- **Comments explain why, not what.** The codebase is self-documenting
  through naming. Only add a comment for a non-obvious constraint,
  trade-off, or a bug the code was shaped to avoid. Don't add multi-line
  doc blocks to every function — see any existing file for the calibration.
- **Few, intentional dependencies.** Check ARCHITECTURE.md § design
  decision 7 before adding one. Hand-rolled utilities (router, IndexedDB
  layer, ZIP reader, HTML→Markdown walker) exist because the alternative
  dependency wasn't worth its weight for what's needed here.
- **Optional-field registration (schema-merge safety).** `Doc` and
  `DocLayout` have optional fields (`institute?`, `coverLines?`,
  `favorite?`, `coverColors?`, …). `lib/store.ts`'s `withDefaults()`
  merges stored/backup data over in-code defaults and **drops any key
  the defaults object doesn't know about** — that's how removed features
  clean themselves up on load. A *new* optional field must be added to
  `DOC_OPTIONAL_KEYS` or `LAYOUT_OPTIONAL_KEYS` in `lib/store.ts`, or it
  will silently vanish on the next reload/restore. `store.test.ts` has a
  regression test for this exact mechanism — extend it when you add a
  field. A new **required** `Settings` field just needs a default in
  `DEFAULT_SETTINGS` (`brand/defaults.ts`) — the same merge keeps it.
- **IconButton for icon-only controls** (not a bare `<button>`) — gives
  both the desktop `title` tooltip and the touch long-press hint for
  free. See `components/ui.tsx` header comment for why both are needed.
- **`useFocusTrap(open, ref)`** (`components/ui.tsx`) — use it on any
  hand-rolled dialog (the shared `Modal` already does). It's a
  `useLayoutEffect`-based trap specifically so it captures the
  pre-open `activeElement` before a component's own "focus the panel"
  effect can move focus first.

## Testing

```bash
npm test          # vitest run — single pass, what CI runs
npm run test:watch
```

Vitest + happy-dom (see `vite.config.ts`'s `test` block). Tests live
next to the source they cover (`foo.ts` → `foo.test.ts`).

**What's covered and why:** the highest-risk, highest-blast-radius pure
logic — `lib/questionText.ts` and `markdown/mcq.ts` (the question-bank
parsing pipeline), `lib/importer.ts` (Smart Paste / HTML→Markdown),
`lib/markdownReview.ts` (Import Review's stats + normalize), `lib/search.ts`,
`lib/store.ts`'s schema-merge (`withDefaults`), `markdown/renderer.ts`,
and `pdf/document.ts` (the document-assembly layer — pure string
building, no browser needed, and where most real pipeline regressions
would actually show up).

**What's deliberately not covered, and why:** `lib/docx.ts` (hand-rolled
ZIP + WordprocessingML reader) and `lib/zip.ts` are self-contained,
lower-traffic code paths — real coverage would need binary `.docx`
fixtures for meaningful assertions, which is a bigger lift than the
current risk justifies. The **PDF engine's actual browser rendering**
(`pdf/engine/`, the Paged.js harness) is not unit-testable — it needs
real `getBoundingClientRect`/`getComputedStyle`/`Range.getClientRects`
behavior. Verify it manually with the `verify` skill (`.claude/skills/verify/`)
using the pre-installed Chromium + Playwright before shipping engine or
harness changes; don't try to fake this with jsdom/happy-dom, it will
give false confidence.

**Performance changes need numbers.** `scripts/stress.mjs` (see its
header, and `docs/performance.md` for the reference tables) drives the
real production build in headless Chromium and measures pagination,
responsiveness, DOM growth and PDF export at 100 → 1000 pages. Any
change claiming a performance or reliability benefit should show a
before/after from that harness, and any change touching pagination or
the engine must at minimum keep page counts and export success identical
across its scenarios.

**No ESLint currently.** `typescript-eslint@8.x` crashes against
TypeScript 7's restructured compiler internals as of this writing —
this is an upstream compatibility gap, not a missing config. `tsc --noEmit`
under `strict` + `noUnusedLocals`/`noUnusedParameters` already covers
most of what lint would add; the remaining gap (react-hooks exhaustive-deps,
rules-of-hooks) is currently covered by code review discipline and the
`eslint-disable-next-line` comments already in the source documenting
*intentional* exceptions — re-attempt adding ESLint once typescript-eslint
publishes a release compatible with the installed TypeScript major version.

## Build & validate workflow

```bash
npm install        # also runs scripts/sync-vendor.mjs (Paged.js + font TTFs)
npm run dev         # Vite dev server
npm run typecheck   # tsc --noEmit — run before considering any change done
npm test            # vitest run
npm run build        # production build → dist/
```

CI (`.github/workflows/ci.yml`) runs typecheck → test → build on every
push to `main` and every PR. All three must pass.

For a UI/behavioral change, also do a manual pass in the browser
(`npm run dev`) — type-checking and unit tests verify *correctness of
logic*, not *correctness of the feature*. Use the `verify` skill for a
scripted Playwright pass if you want it automated for one session.

## Common pitfalls (learned the hard way — see the git history for the fixes)

- **A "glued option" heuristic can eat a legitimate marker.** `lib/questionText.ts`'s
  preprocessing regex that splits `"...idea of1. Anti-"` into `"...idea of\n1. Anti-"`
  originally also matched `"Q1. What…"` (a real question marker), corrupting
  it, because both are "a letter directly before a digit-marker". Fixed with
  a lookbehind requiring *another* letter before that letter — the lesson:
  any regex-based heuristic over free-form pasted text needs a test with a
  realistic, differently-shaped fixture, not just the one example in the
  comment that motivated it. `questionText.test.ts` now guards this.
- **`isCleanQuestionDialect` vs `looksLikeQuestionBank`.** `mcq.ts`'s parser
  is intentionally permissive (accepts `Q1.`, `(1)`–`(5)` options, etc.), so
  a lot of "raw-looking" pasted text is actually *already* valid in the
  app's own dialect and `smartPaste` correctly leaves it untouched. Don't
  assume a numbered-question fixture needs restructuring — check
  `isCleanQuestionDialect` first (or use a form outside mcq.ts's grammar,
  like bracket-numbered `[n/total]`, to test the raw-paper path for real).
- **Naive `useEffect` deps on a dialog's focus effect re-focus on every
  keystroke.** Keying a "focus the panel on open" effect off `onClose` (or
  any prop that changes on every parent re-render) re-runs it on every
  keystroke in any field the dialog contains, yanking focus out of the
  input the user is typing in (and dismissing the on-screen keyboard on
  mobile). Keep that effect's deps to just `[open]`.
- **`regenerator-runtime` must be imported before fontkit is used.**
  `@pdf-lib/fontkit` ships Babel-transpiled generators for its Indic
  shaping engine that call the global `regeneratorRuntime` at run time;
  without importing `regenerator-runtime/runtime.js` first, the *first*
  Devanagari glyph run throws and kills the whole export. See
  `pdf/engine/fonts.ts`'s top-of-file import.
- **Never use CSS `target-counter()` for cross-page references.**
  Paged.js resolves it in `afterPageLayout` by re-querying the whole
  accumulated document and walking *every* laid-out page with
  `getComputedStyle` — after **each** page. With a TOC that made notes
  pagination O(pages²): measured ~70 → ~322 ms/page between 79 and 766
  pages, while a TOC-less Question Bank stayed flat. The harness fills
  real `.toc__page` spans in one pass after layout instead (identical
  output, verified byte-identical PDFs). Any future cross-page
  reference should follow the same one-pass post-layout pattern.
- **Pagination waits for fonts.** `buildDocumentHtml` sets
  `window.PagedConfig.before` to await `document.fonts.ready` (raced
  with a 5 s timeout) so breaks are measured with the real fonts, not
  `font-display: swap` fallbacks — Latin faces are warm from the app
  shell, but Devanagari faces load on first use and would otherwise
  race the first layout.
- **Paged.js is a print polyfill — `@media print` rules apply to the
  paginated screen view too.** An `!important` zoom reset under
  `@media print` in `PAGED_PREVIEW_CSS` would permanently disable the
  preview's zoom controls, not just affect actual printing. The harness
  resets zoom imperatively around `window.print()` instead.
- **Drop handlers are capture-phase** (`useFileDrop` in `components/ui.tsx`)
  so a drop never falls through to CodeMirror's own file handling.
  Testing drops (Playwright or otherwise) needs a real `DragEvent` with a
  `DataTransfer` built via `new DataTransfer()` — no `dragenter` required.
- **CodeMirror's view isn't reachable from the DOM in production builds.**
  When testing/inspecting editor content externally, read
  `document.querySelector(".cm-content").innerText` — note it renders
  each blank line as an extra `\n`.
- **Never smooth-scroll a virtualised scroller to `scrollHeight`.** A
  500-page note gives CodeMirror a ~700k px `scrollHeight`;
  `scrollTo({behavior:"smooth"})` caps its velocity and CM re-measures line
  heights as it goes, so the animation stalls at ~1% — the "first-click
  hang". Go-to-Top/Bottom set `scrollTop` directly (instant), re-asserting
  the bottom across a couple of frames because `scrollHeight` grows as lower
  lines render. Any large-document jump must be verified against a real
  500+ page body, not a small fixture — the failure only appears at scale.
- **Editor→preview sync is intentional-only.** Don't re-add a passive
  `scroll`→`onScrollFraction` listener to `CodeMirror`; manual scrolling is
  meant to be independent, and on a large document a per-frame preview post
  is pure waste. Sync flows only from cursor placement (`onCursorLine` →
  `scroll-to-line`) and the `EditorScrollbar` drag (`onSyncScroll` →
  `scroll-to-pct`, `body`-mapped). See ARCHITECTURE.md § Editor ⇄ preview.
- **Overlay controls that sit over an iframe need a background-aware tone.**
  The preview's `ScrollJump` overlays the *document* reading theme (flow) or
  the dark paged desk (pages), not the app theme — so it takes a `tone`
  (`onLight`/`onDark`) rather than app-theme tokens, or it washes out in
  half the Studio-light/dark × document-light/dark combinations.
- **Field hints are an on-demand affordance, not a caption.** `Field`
  (`components/ui.tsx`) renders its `hint` through `HintInfo` (a small ⓘ with
  hover `title` + touch long-press bubble), which keeps the Settings pane
  short. Put the `HintInfo` trigger inside the `<label>` only with
  `preventDefault` on press so revealing the hint never focuses the field.

## Extension points (checklist)

Mirrors ARCHITECTURE.md § How to extend — read that section for the full
reasoning; this is the quick-reference version:

- **New template** → `templates/meta.ts` entry + `templates/starters.ts`
  + a body builder/CSS entry in `templates/index.ts`. Retiring one →
  add to `LEGACY_TEMPLATES` in `lib/store.ts` so stored documents and
  backups migrate on load (regression tests in `store.test.ts`).
- **New cover style** → `.cover--<id>` in `pdf/styles/covers.css` +
  `COVER_PATTERNS` in `pdf/document.ts` + `COVER_STYLES` in
  `views/editor/Details.tsx`. Retiring one → add to `LEGACY_COVERS`
  in `lib/store.ts` (and fix any test/starter that names the old id;
  `document.test.ts` and `search.test.ts` assert on the default style).
  The three shipping presets (Meridian/Aurora/Eclipse) each bake in their
  own hairline frame + shade so "premium" needs no extra toggles.
- **New cover pattern** → add the kind to `CoverPattern` (`lib/types.ts`)
  and the exposed `PATTERN_OPTIONS` (`Details.tsx`), a branch in
  `coverPatternSvg` (`brand/marks.ts`), and — if it can be a preset default
  — `CoverPatternKind`. `resolveDesign` validates `pattern` against a
  `PATTERNS` set and coerces anything unknown (including retired kinds) to
  `geometry`, so trimming the set never crashes a stored design.
- **New interior colour palette** → add a `ColorPalette` to `DEFAULT_PALETTES`
  in `lib/palettes.ts` (five `BrandConfig.colors`); the chip picker in
  `Details.tsx` (`InteriorPalettes`) and `saveBrand` pick it up. Custom palettes
  and favorited/saved cover designs are localStorage-only (never in a backup),
  same contract as `lib/presets.ts`.
- **New callout type** → one entry in `CALLOUTS` (`markdown/renderer.ts`)
  + a `.callout--<type>` rule in `pdf/styles/print-base.css`.
- **New toolbar action** → a command in `views/editor/commands.ts` +
  an entry in `ACTION_GROUPS` (`views/editor/Toolbar.tsx`) with a
  `defaultPinned` flag — authors can still pin/unpin it from More later.
- **New optional `Doc`/`DocLayout` field** → add to the type in
  `lib/types.ts` **and** to `DOC_OPTIONAL_KEYS`/`LAYOUT_OPTIONAL_KEYS`
  in `lib/store.ts` (see Conventions above) — this is the one step that's
  easy to forget and silently loses user data if you do.
- **New example document** → one entry in `templates/demos.ts` (loaded
  lazily — see `views/Library.tsx`'s `openExamples()` — so don't import
  it eagerly elsewhere either).

## Commit/PR expectations

No special format beyond what CLAUDE.md and the repo's existing commit
history already show: clear, descriptive messages explaining *why*.
Every change should leave `npm run typecheck`, `npm test` and `npm run build`
passing — CI enforces this on `main` and on PRs.
