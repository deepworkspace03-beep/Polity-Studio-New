import { VIEWER_JS } from "./harness";

/**
 * Standalone HTML export — a snapshot of the *already paginated* DOM
 * from the Publish preview, packaged as one offline file.
 *
 * Earlier versions re-shipped the whole pipeline (the 500 KB Paged.js
 * runtime + the harness) and re-paginated on every open, which made the
 * HTML dramatically larger than the PDF and slow to open. Snapshotting
 * the laid-out pages instead means:
 *
 *   - no Paged.js runtime in the file (~500 KB saved),
 *   - the file opens instantly (layout already done),
 *   - what you reviewed is byte-for-byte what you exported,
 *   - only a ~2 KB viewer script (zoom, pinch, page indicator) rides along.
 *
 * Fonts are the one asset that must be inlined (base64 woff2) for the
 * file to work offline; faces are filtered to the scripts the document
 * actually uses (latin / latin-ext / Devanagari), so a plain-English
 * document skips ~60% of the font payload.
 */

const FONT_CSS_URL = "/fonts/fonts.css";
const FACE_RE = /@font-face\s*\{[^}]*\}/g;
const URL_RE = /url\('(\/fonts\/[^']+\.woff2)'\)/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Which unicode scripts the document's text actually touches. */
function detectScripts(text: string): { latinExt: boolean; devanagari: boolean } {
  return {
    latinExt: /[Ā-ɏḀ-ỿⱠ-Ɀ꜠-ꟿ]/.test(text),
    devanagari: /[ऀ-ॿ᳐-᳹꣠-ꣿ]/.test(text),
  };
}

/** Inlines only the font faces the document can actually use as base64
    data URIs, so the file has no external dependencies once saved. */
async function inlineFontFaces(text: string): Promise<string> {
  const css = await (await fetch(FONT_CSS_URL)).text();
  const scripts = detectScripts(text);
  const faces = (css.match(FACE_RE) ?? []).filter((f) => {
    const url = f.match(URL_RE)?.[1] ?? "";
    if (url.includes("devanagari")) return scripts.devanagari;
    if (url.includes("latin-ext")) return scripts.latinExt;
    return true;
  });
  const resolved = await Promise.all(
    faces.map(async (block) => {
      const m = block.match(URL_RE);
      if (!m) return block;
      const bytes = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
      // Function replacer: base64 can contain "$"-sequences that a
      // replacement string would interpret as substitution patterns.
      return block.replace(m[0], () => `url('data:font/woff2;base64,${bytesToBase64(bytes)}')`);
    }),
  );
  return resolved.join("\n");
}

/** Serializes the paginated Publish document into a single
    self-contained HTML file. `paginated` is the live iframe document in
    which Paged.js has already finished laying out the pages. */
export async function buildStandaloneHtml(paginated: Document, fileTitle: string): Promise<string> {
  const root = paginated.documentElement.cloneNode(true) as HTMLElement;

  // Strip everything the static snapshot doesn't need: the harness and
  // Paged.js scripts, the consumed watermark template, and the
  // fonts.css link (replaced by the inlined faces below).
  root.querySelectorAll("script, template, link[rel='stylesheet']").forEach((el) => el.remove());

  // If a PDF was exported first, the engine materialized every
  // ::before/::after into <x-pseudo> elements carrying multi-KB inline
  // computed styles. Undo that for the snapshot — removing the disabling
  // stylesheet restores the original CSS pseudo-elements, which render
  // identically at a fraction of the size.
  root.querySelectorAll("x-pseudo, #x-pseudo-off").forEach((el) => el.remove());
  root.querySelectorAll(".x-po").forEach((el) => el.classList.remove("x-po"));

  const title = root.querySelector("title");
  if (title) title.textContent = fileTitle;

  const fontCss = await inlineFontFaces(paginated.body.textContent ?? "");
  const head = root.querySelector("head");
  if (head) {
    const style = paginated.createElement("style");
    style.textContent = fontCss;
    head.appendChild(style);
  }

  // The viewer script re-applies fit-width zoom on open; clear whatever
  // zoom the Publish preview had applied at snapshot time.
  const pagesRoot = root.querySelector<HTMLElement>(".pagedjs_pages");
  if (pagesRoot) pagesRoot.style.zoom = "";

  const body = root.querySelector("body");
  if (body) {
    const viewer = paginated.createElement("script");
    viewer.textContent = VIEWER_JS;
    body.appendChild(viewer);
  }

  return `<!DOCTYPE html>\n${root.outerHTML}`;
}

/** Pageless (flow) HTML export — the document as one continuous,
    responsive reading page: no pagination, no page chrome, no scripts.
    Ideal for web publishing and small-screen reading, and the natural
    home for Question Banks consumed digitally. The builder's
    flow+export mode is already script-free (no inline-editing harness);
    all this adds is offline fonts. */
export async function buildFlowHtml(html: string, fileTitle: string): Promise<string> {
  const root = new DOMParser().parseFromString(html, "text/html");
  root.querySelectorAll("link[rel='stylesheet']").forEach((el) => el.remove());
  const title = root.querySelector("title");
  if (title) title.textContent = fileTitle;
  const fontCss = await inlineFontFaces(root.body.textContent ?? "");
  const style = root.createElement("style");
  style.textContent = fontCss;
  root.head.appendChild(style);
  return `<!DOCTYPE html>\n${root.documentElement.outerHTML}`;
}
