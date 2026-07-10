import type { BrandConfig, Doc } from "../lib/types";
import { buildDocumentHtml } from "./document";

/**
 * A second export format alongside PDF: the exact same paginated
 * document (cover, TOC, running headers/footers, watermark, zoom and
 * page navigation), packaged as one offline-capable HTML file instead
 * of a PDF. It reuses the same builder that feeds the previews and the
 * PDF export — no second rendering pipeline to keep in sync — so it's
 * pixel-identical to the PDF, opens instantly in any browser (no PDF
 * reader, no parsing), and is usually smaller because there's no font
 * subsetting/embedding step: the browser's own font cache does the work
 * for the woff2 files this file inlines as base64.
 *
 * DOCX was considered and rejected for now: Word's format has no good
 * story for the vector watermark, CSS gradients or the exact print
 * geometry this app already gets right, so it would mean a second,
 * lesser rendering pipeline (see ARCHITECTURE.md's "one builder, three
 * consumers" principle) rather than a rerun of the same one.
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

/** Inlines only the font faces the document can actually use (skips the
    ~270 KB Devanagari family for English documents) as base64 data URIs,
    so the file has no external dependencies once downloaded. */
async function inlineFontFaces(lang: Doc["lang"]): Promise<string> {
  const css = await (await fetch(FONT_CSS_URL)).text();
  const faces = css.match(FACE_RE) ?? [];
  const wanted = faces.filter((f) => lang === "hi" || !/Devanagari/.test(f));
  const resolved = await Promise.all(
    wanted.map(async (block) => {
      const m = block.match(URL_RE);
      if (!m) return block;
      const bytes = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
      return block.replace(m[0], `url('data:font/woff2;base64,${bytesToBase64(bytes)}')`);
    }),
  );
  return resolved.join("\n");
}

/** Builds a fully self-contained HTML document — same cover, pages,
    watermark and interactive zoom/page-nav as the Publish preview. Both
    the pagination engine and the fonts are normally loaded from
    `/fonts/…` and `/vendor/…` (fine inside the app's own origin, broken
    once the file is saved and opened elsewhere) — this inlines both so
    the download has zero external dependencies. */
export async function buildStandaloneHtml(doc: Doc, brand: BrandConfig, fileTitle: string): Promise<string> {
  const [html, fontCss, pagedJs] = await Promise.all([
    Promise.resolve(buildDocumentHtml(doc, brand, { mode: "paged", purpose: "preview", fileTitle })),
    inlineFontFaces(doc.lang),
    (await fetch("/vendor/paged.polyfill.min.js")).text(),
  ]);
  // Function replacers, not replacement strings: minified JS and base64
  // can both coincidentally contain "$&"-style sequences, which
  // String.replace would otherwise interpret as substitution patterns
  // and use to silently corrupt the embedded script.
  return html
    .replace(`<link rel="stylesheet" href="/fonts/fonts.css">`, () => `<style>${fontCss}</style>`)
    .replace(`<script src="/vendor/paged.polyfill.min.js"></script>`, () => `<script>${pagedJs}</script>`);
}
