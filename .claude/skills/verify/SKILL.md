---
name: verify
description: Build, launch and drive Polity Studio in a browser to verify changes end-to-end.
---

# Verifying Polity Studio

Pure client-side Vite SPA (no backend). All state is in IndexedDB, so every
fresh browser context starts with an empty library.

## Build & serve

```bash
npm run typecheck && npm run build
npm run preview -- --port 4173 --host 127.0.0.1   # serves dist/
```

## Drive it (Playwright)

Use the pre-installed Chromium: `chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`
with `playwright-core` installed in a scratch dir (not this repo).

Gotchas that cost time before:

- **Reading editor content**: `document.querySelector(".cm-content").innerText`.
  CodeMirror's view object is not reachable from the DOM in the production build.
  innerText renders each blank line as an extra `\n` — compare accordingly.
- **Clipboard paste**: grant `clipboard-read`/`clipboard-write` on the origin,
  write via `navigator.clipboard.write([new ClipboardItem({...})])` in the page,
  then `page.keyboard.press("Control+v")` — this produces a real trusted paste event.
- **File drop**: dispatch a `DragEvent("drop", { dataTransfer })` built in-page with
  `new DataTransfer()` + `dt.items.add(new File([...], "x.md", { type: "text/markdown" }))`.
  No dragenter needed; drop handlers are capture-phase on the Library root and editor pane.
- The Library search box only renders when the library has **more than 3 documents**.
- Toasts stack — assert on all `[role="status"]` elements, not the first.

## Flows worth driving

- Drop .md/.txt/.html files on Library → docs created, `# Title` promoted to doc title.
- Paste Word/GDocs-flavored HTML in the editor → converted Markdown + summary toast.
- Paste plain Markdown / MCQ bodies (`Q1.`, `a)` options) → must pass through untouched.
- Ctrl+K palette: doc content search → Enter deep-links `#/edit/:id/:line`.
- Ctrl+K **inside the editor** must insert a link, not open the palette.
- Publish PDF from the editor (heavier; exercises the pdf engine chunk).
