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
 * file to work offline, and they dominate the file size: the full bundled
 * set is ~370 KB of woff2 (~490 KB once base64-inflated) across 5 weights
 * each of Manrope/Literata (+ italics) and 2 of JetBrains Mono, before
 * Devanagari. Two independent filters keep only what a given document
 * actually needs:
 *   1. script — Devanagari faces are skipped unless the text contains
 *      Devanagari, latin-ext unless it contains extended-Latin characters.
 *   2. face usage — of what's left, only the (family, weight, italic)
 *      combinations the rendered DOM actually resolves to are kept (read
 *      via getComputedStyle, so it accounts for the full cascade: theme,
 *      cover overrides, template CSS). A document with no code block
 *      skips JetBrains Mono entirely; one with no italic emphasis skips
 *      Literata's italic faces; etc. Nearest-weight matching mirrors the
 *      PDF engine's own (pdf/engine/fonts.ts's pickWeight) so the face
 *      kept is the one a viewer's browser actually rendered.
 */

const FONT_CSS_URL = "/fonts/fonts.css";
const FACE_RE = /@font-face\s*\{[^}]*\}/g;
const URL_RE = /url\('(\/fonts\/[^']+\.woff2)'\)/;
const FAMILY_RE = /font-family:\s*'([^']+)'/;
const WEIGHT_RE = /font-weight:\s*(\d+)/;
const STYLE_RE = /font-style:\s*(italic)/;

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

interface FaceInfo {
  block: string;
  family: string;
  weight: number;
  italic: boolean;
}

function parseFaceBlocks(css: string): FaceInfo[] {
  return (css.match(FACE_RE) ?? []).map((block) => ({
    block,
    family: (block.match(FAMILY_RE)?.[1] ?? "").toLowerCase(),
    weight: Number(block.match(WEIGHT_RE)?.[1] ?? "400"),
    italic: STYLE_RE.test(block),
  }));
}

/** Every (family, weight, italic) triple the rendered document actually
    resolves to, read from computed style over the whole DOM — the most
    reliable ground truth since the browser has already applied the full
    cascade. Returns null (meaning "keep everything") if anything goes
    wrong, so a detection failure never drops a face the document needs.

    Only the *first* family in each element's computed font-family stack
    is recorded — `getComputedStyle().fontFamily` returns the whole
    fallback list as authored (e.g. `"Literata", "Noto Serif Devanagari",
    Georgia, serif`), not which one actually rendered the glyphs, and
    every stack in this app's CSS is written primary-family-first. Taking
    the whole list would mark the Devanagari fallback "used" on every
    single element, defeating the filter entirely — so Devanagari
    inclusion stays governed solely by the script-level check in
    inlineFontFaces (detectScripts), and this function only narrows
    weight/style *within* the already script-gated families. */
function usedFaceKeys(doc: Document): Set<string> | null {
  try {
    const win = doc.defaultView;
    if (!win) return null;
    const used = new Set<string>();
    for (const el of doc.body.querySelectorAll("*")) {
      const cs = win.getComputedStyle(el);
      const first = cs.fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
      if (!first) continue;
      const weight = Number(cs.fontWeight) || 400;
      const italic = cs.fontStyle === "italic";
      used.add(`${first}|${weight}|${italic}`);
    }
    return used;
  } catch {
    return null;
  }
}

/** Nearest-weight match within a family, mirroring the PDF engine's own
    CSS weight-matching so the face kept is the one actually rendered. */
function resolves(faces: FaceInfo[], family: string, weight: number, italic: boolean): FaceInfo | undefined {
  const pool = faces.filter((f) => f.family === family);
  if (!pool.length) return undefined;
  const styled = pool.filter((f) => f.italic === italic);
  const candidates = styled.length ? styled : pool;
  const sorted = [...candidates].sort((a, b) => a.weight - b.weight);
  const exact = sorted.find((f) => f.weight === weight);
  if (exact) return exact;
  const below = sorted.filter((f) => f.weight < weight).pop();
  const above = sorted.find((f) => f.weight > weight);
  return weight <= 500 ? below ?? above : above ?? below;
}

/** Inlines only the font faces the document can actually use as base64
    data URIs, so the file has no external dependencies once saved. */
async function inlineFontFaces(paginated: Document): Promise<string> {
  const css = await (await fetch(FONT_CSS_URL)).text();
  const scripts = detectScripts(paginated.body.textContent ?? "");
  const allFaces = parseFaceBlocks(css);
  const byScript = allFaces.filter((f) => {
    // Devanagari families are script-gated by family name; everything
    // else (Manrope/Literata/JetBrains Mono) is gated by which unicode
    // slice the block itself declares, matched via its file name.
    if (f.family.includes("devanagari")) return scripts.devanagari;
    const url = f.block.match(URL_RE)?.[1] ?? "";
    if (url.includes("latin-ext")) return scripts.latinExt;
    return true;
  });

  const used = usedFaceKeys(paginated);
  let faces = byScript;
  if (used) {
    const keep = new Set<FaceInfo>();
    // Devanagari inclusion is already decided by the script check above;
    // usage-narrowing only applies within the other families (see
    // usedFaceKeys for why Devanagari can't be judged per-element).
    for (const face of byScript) {
      if (face.family.includes("devanagari")) keep.add(face);
    }
    for (const key of used) {
      const [family, weightStr, italicStr] = key.split("|");
      const face = resolves(byScript, family, Number(weightStr), italicStr === "true");
      if (face) keep.add(face);
    }
    if (keep.size) faces = [...keep]; // never end up with zero faces on a detection miss
  }

  const resolved = await Promise.all(
    faces.map(async (face) => {
      const m = face.block.match(URL_RE);
      if (!m) return face.block;
      const bytes = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
      // Function replacer: base64 can contain "$"-sequences that a
      // replacement string would interpret as substitution patterns.
      return face.block.replace(m[0], () => `url('data:font/woff2;base64,${bytesToBase64(bytes)}')`);
    }),
  );
  return resolved.join("\n");
}

/** Serializes the paginated Publish document into a single
    self-contained HTML file. `paginated` is the live iframe document in
    which Paged.js has already finished laying out the pages. */
export async function buildStandaloneHtml(paginated: Document, fileTitle: string): Promise<string> {
  const fontCss = await inlineFontFaces(paginated);
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
