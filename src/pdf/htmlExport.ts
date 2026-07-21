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
 * file to work offline. The single biggest lever on file size is *which*
 * faces get inlined: the naive path embeds every weight of every family
 * (~0.5 MB of base64 before a single glyph is read), so both exporters
 * now inline **only the faces the document actually renders**, discovered
 * from a live layout pass (`collectFontUsage`). A plain-English notes
 * document that uses Literata 400/700 + Manrope 700/800 drops ~15 of the
 * ~24 bundled faces — typically a 40–60% cut in the fixed font payload.
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

/* ── Font-usage detection ─────────────────────────────────────────────
   The bundled fonts.css ships every weight of every family. Inlining all
   of them dominates the export size regardless of what the document uses,
   so we walk the *laid-out* document, record the (family, weight, style)
   triples that are actually rendered, and keep only the matching faces.
   The Devanagari faces are the exception: they are never the first family
   in any stack (they sit as a fallback behind Literata/Manrope), so they
   are kept whenever the text contains Devanagari, not by family match. */

interface FaceInfo {
  block: string;
  family: string; // lower-cased
  weight: number;
  style: string; // "normal" | "italic"
  url: string;
  latinExt: boolean;
  devanagari: boolean;
}

interface FontUsage {
  families: Set<string>; // first-family tokens seen (lower-cased)
  weights: Map<string, Set<number>>; // family → computed weights seen
  styles: Map<string, Set<string>>; // family → styles seen
  latinExt: boolean;
  devanagari: boolean;
}

const DEVANAGARI_RE = /[ऀ-ॿ᳐-᳹꣠-ꣿ]/;
const LATIN_EXT_RE = /[Ā-ɏḀ-ỿⱠ-Ɀ꜠-ꟿ]/;

function parseFaces(css: string): FaceInfo[] {
  const faces: FaceInfo[] = [];
  for (const block of css.match(FACE_RE) ?? []) {
    const family = block.match(/font-family:\s*['"]?([^;'"]+)['"]?/i)?.[1]?.trim().toLowerCase();
    const url = block.match(URL_RE)?.[1] ?? "";
    if (!family || !url) continue;
    faces.push({
      block,
      family,
      weight: Number(block.match(/font-weight:\s*(\d+)/i)?.[1] ?? "400"),
      style: /font-style:\s*italic/i.test(block) ? "italic" : "normal",
      url,
      latinExt: url.includes("latin-ext"),
      devanagari: url.includes("devanagari"),
    });
  }
  return faces;
}

/** First family token of a computed `font-family` stack, normalized. */
function firstFamily(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^['"]|['"]$/g, "").toLowerCase();
}

/** Walks a laid-out document collecting the fonts it actually renders.
    Bails out early once every available (family, weight) and both scripts
    have been seen, so a 1000-page snapshot doesn't pay for a full walk. */
function collectFontUsage(doc: Document, faces: FaceInfo[]): FontUsage {
  const usage: FontUsage = { families: new Set(), weights: new Map(), styles: new Map(), latinExt: false, devanagari: false };
  const availWeights = new Map<string, Set<number>>();
  for (const f of faces) {
    if (f.devanagari) continue;
    if (!availWeights.has(f.family)) availWeights.set(f.family, new Set());
    availWeights.get(f.family)!.add(f.weight);
  }
  const win = doc.defaultView;
  if (!win) return usage;

  const note = (fam: string, weight: number, style: string) => {
    usage.families.add(fam);
    if (!usage.weights.has(fam)) usage.weights.set(fam, new Set());
    usage.weights.get(fam)!.add(weight);
    if (!usage.styles.has(fam)) usage.styles.set(fam, new Set());
    usage.styles.get(fam)!.add(style);
  };

  const saturated = () => {
    if (!usage.devanagari || !usage.latinExt) return false;
    for (const [fam, ws] of availWeights) {
      const seen = usage.weights.get(fam);
      if (!seen || seen.size < ws.size) return false;
    }
    return true;
  };

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = doc.body;
  while (node) {
    const el = node as Element;
    const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
    if (text) {
      if (!usage.devanagari && DEVANAGARI_RE.test(text)) usage.devanagari = true;
      if (!usage.latinExt && LATIN_EXT_RE.test(text)) usage.latinExt = true;
    }
    for (const pseudo of ["", "::before", "::after"] as const) {
      const cs = win.getComputedStyle(el, pseudo || null);
      // Only pseudo-elements with generated content actually paint text.
      if (pseudo && (cs.content === "none" || cs.content === "normal" || !cs.content)) continue;
      const fam = firstFamily(cs.fontFamily);
      if (fam && availWeights.has(fam)) note(fam, Number(cs.fontWeight) || 400, cs.fontStyle === "italic" ? "italic" : "normal");
    }
    if (saturated()) break;
    node = walker.nextNode();
  }
  return usage;
}

/** Nearest available weight — so every *used* weight maps onto a real
    face that we keep, and only genuinely-unused weights are dropped. */
function nearest(available: number[], w: number): number {
  return available.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), available[0]);
}

/** Selects the @font-face blocks the document needs. */
function selectFaces(faces: FaceInfo[], usage: FontUsage): FaceInfo[] {
  // Available Latin weights per family (from the faces themselves).
  const avail = new Map<string, number[]>();
  for (const f of faces) {
    if (f.devanagari) continue;
    const list = avail.get(f.family) ?? [];
    if (!list.includes(f.weight)) list.push(f.weight);
    avail.set(f.family, list);
  }
  // Map each used computed weight onto the nearest available real weight.
  const needed = new Map<string, Set<number>>();
  for (const [fam, ws] of usage.weights) {
    const a = avail.get(fam);
    if (!a) continue;
    const set = new Set<number>();
    for (const w of ws) set.add(nearest(a, w));
    needed.set(fam, set);
  }
  return faces.filter((f) => {
    if (f.devanagari) return usage.devanagari; // fallback script, kept by text
    if (!usage.families.has(f.family)) return false;
    if (f.latinExt && !usage.latinExt) return false;
    // Keep normal always (the base face); keep italic only when italic is used.
    if (f.style === "italic" && !usage.styles.get(f.family)?.has("italic")) return false;
    const need = needed.get(f.family);
    return !need || need.has(f.weight);
  });
}

/** Inlines the used font faces as base64 data URIs (no external
    dependencies once saved). `doc` is a laid-out document used to detect
    which faces are actually rendered. */
async function inlineUsedFontFaces(doc: Document): Promise<string> {
  const css = await (await fetch(FONT_CSS_URL)).text();
  const faces = parseFaces(css);
  const usage = collectFontUsage(doc, faces);
  const chosen = selectFaces(faces, usage);
  const resolved = await Promise.all(
    chosen.map(async (f) => {
      const bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
      // Function replacer: base64 can contain "$"-sequences a replacement
      // string would misread as substitution patterns.
      return f.block.replace(URL_RE, () => `url('data:font/woff2;base64,${bytesToBase64(bytes)}')`);
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

  const fontCss = await inlineUsedFontFaces(paginated);
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
    home for Question Banks consumed digitally.

    `rendered` is a *live, laid-out* flow document (the caller renders the
    flow build in a hidden iframe and waits for fonts), so this can inline
    only the faces the document actually uses — the same size win as the
    paged export. The flow+export build is already script-free (no
    inline-editing harness), so all that is added is offline fonts. */
export async function buildFlowHtml(rendered: Document, fileTitle: string): Promise<string> {
  const root = rendered.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll("script, template, link[rel='stylesheet']").forEach((el) => el.remove());
  root.querySelectorAll("x-pseudo, #x-pseudo-off").forEach((el) => el.remove());
  root.querySelectorAll(".x-po").forEach((el) => el.classList.remove("x-po"));
  const title = root.querySelector("title");
  if (title) title.textContent = fileTitle;
  const fontCss = await inlineUsedFontFaces(rendered);
  const style = rendered.createElement("style");
  style.textContent = fontCss;
  root.querySelector("head")?.appendChild(style);
  return `<!DOCTYPE html>\n${root.outerHTML}`;
}
