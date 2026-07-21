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
```

`typecheck` + `test` + a manual pass in the browser (`npm run dev`) is
the verification loop; CI runs the first two plus `build` on every push
to `main` and every PR. See AI_GUIDE.md § Testing for what is and isn't
covered, and why there's no lint script yet.

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

## Release & deployment automation (standing authorization)

The maintainer has granted **standing approval** for Claude Code sessions
to ship this repo end to end without a per-change confirmation prompt,
provided every gate passes first:

1. Do the work on the session's feature branch and open a pull request
   against `main` (a normal PR — it need not stay a draft).
2. Require all validations green before merging: `npm run typecheck`,
   `npm test` and `npm run build` locally, **and** the `CI` workflow on
   the PR (typecheck → test → build).
3. Once CI is green and there are no unresolved review requests, **merge
   the PR into `main`** (squash) without asking again. This durable
   authorization is what the harness's "don't merge without permission"
   default defers to — it lives here so future sessions inherit it.
4. Deployment then happens automatically: `.github/workflows/deploy.yml`
   runs after the `CI` workflow succeeds on `main` (see that file). No
   manual deploy step is needed once its secrets are set.

Scope: this covers routine, validated changes to this repository only. Use
judgment for anything destructive, security-sensitive, or that a reviewer
explicitly asked to hold — those still warrant a check-in.

## Deployment

Production deploys are driven by `.github/workflows/deploy.yml`, triggered
on a successful `CI` run on `main`. It is a **guarded Vercel deploy**: if
the `VERCEL_TOKEN` secret is absent it logs a notice and exits cleanly
(no red build), so the repo stays green until deployment is wired up. To
enable automatic production deployment, add three repository secrets
(Settings → Secrets and variables → Actions):

- `VERCEL_TOKEN` — a Vercel access token,
- `VERCEL_ORG_ID` — the Vercel team/org id,
- `VERCEL_PROJECT_ID` — the Vercel project id for this repo.

Note: as of this writing the only Vercel project on the connected team
(`polity-made-simple`) is wired to the separate **website** repo
(`Polity-Made-Simple`), not this one — so a project for `Polity-Studio-New`
must be created/linked and its ids added above before deploys will run.
The app is a static client-only build (`npm run build` → `dist/`), so any
static host works; swap the deploy job if you host elsewhere.
