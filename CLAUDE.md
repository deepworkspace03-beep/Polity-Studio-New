# Working in this repo

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first — it covers the design
decisions, folder map, data flow and extension points in one pass. Read
it before grepping around; it answers "why is this built this way" for
every non-obvious piece (the vector PDF engine, the flow-preview
iframe protocol, the cover-designer variables, import/search). Then read
[AI_GUIDE.md](./AI_GUIDE.md) for the operational side: testing
conventions, the build/validate workflow, known pitfalls and the
extension-point checklist. This file only adds what those two don't: a
short command list and a couple of repo-specific conventions.

## Commands

```bash
npm install       # also runs scripts/sync-vendor.mjs (Paged.js + font TTFs)
npm run dev        # Vite dev server
npm run typecheck  # tsc --noEmit — run before considering a change done
npm test            # vitest run
npm run build        # production build → dist/
npm run test:visual  # opt-in PDF-engine visual regression check — not in CI
```

`typecheck` + `test` + a manual pass in the browser (`npm run dev`) is
the verification loop; CI runs the first two plus `build` on every push
to `main` and every PR. See AI_GUIDE.md § Testing for what is and isn't
covered, why there's no lint script yet, and what `test:visual` checks.

## Conventions

- Client-only, no backend — don't introduce a server, API route or
  fetch to a first-party endpoint. Everything is IndexedDB + static
  files (see ARCHITECTURE.md § Storage & data safety).
- Comments explain **why**, not what — the codebase is already
  self-documenting through naming; only add a comment for a
  non-obvious constraint or trade-off.
- New icon-only controls should go through `IconButton` (or
  `useLongPressHint`/`HintBubble` directly, see `views/editor/Details.tsx`
  → `SwatchButton`) so they get both the desktop `title` tooltip and the
  touch long-press hint for free — `components/ui.tsx` documents why
  both are needed.
- Keep dependencies few and intentional (see ARCHITECTURE.md § design
  decision 7) — prefer a small hand-rolled utility over a new package
  for anything in the hot path (editor, preview, PDF export).
