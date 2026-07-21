import type { BrandConfig, Doc } from "../lib/types";
import { escapeHtml, uid } from "../lib/utils";
import { buildZip, type ZipEntry } from "../lib/zip";
import { extractToc } from "../markdown/renderer";
import { parseMcq } from "../markdown/mcq";
import { TEMPLATE_RENDERERS } from "../templates";
import { themeVars } from "./document";
import printBaseCss from "./styles/print-base.css?raw";

/**
 * EPUB 3 export — the reflowable e-book format, and the natural fit for a
 * "pageless" document: it reflows to any screen, carries a real navigation
 * document (the reader's bookmarks / table of contents), keeps internal
 * hyperlinks, and is universally supported (Apple Books, Google Play
 * Books, Kobo, Kindle via conversion, Thorium, Calibre…).
 *
 * Why EPUB over "just HTML" for pageless reading:
 *   - reflowable by design — no fixed page geometry to fight on a phone;
 *   - the nav document is a first-class TOC/bookmark surface (HTML has no
 *     equivalent the reader UI understands);
 *   - fonts are referenced files inside the ZIP, not base64 in the markup,
 *     so there is no 33% base64 tax and no per-open re-parse;
 *   - it is a single, self-contained, recognised document type.
 *
 * The file is a ZIP (STORED entries — `lib/zip.ts`) with the mandatory
 * `mimetype` first. Content is real XHTML: the rendered Markdown is parsed
 * and re-serialized through XMLSerializer so void elements self-close and
 * the output is well-formed (validated before returning). The premium
 * interior styling is reused verbatim (print-base + the template CSS); the
 * page-geometry-only rules (@page, running headers) are simply ignored by
 * reading systems.
 */

const FONT_CSS_URL = "/fonts/fonts.css";
const FACE_RE = /@font-face\s*\{[^}]*\}/g;
const URL_RE = /url\('(\/fonts\/[^']+\.woff2)'\)/;
const DEVANAGARI_RE = /[ऀ-ॿ᳐-᳹꣠-ꣿ]/;
const LATIN_EXT_RE = /[Ā-ɏḀ-ỿⱠ-Ɀ꜠-ꟿ]/;

/** A lean, curated face set keeps the e-book small while preserving the
    brand typography; readers synthesize any weight not embedded. */
const EPUB_WEIGHTS: Record<string, number[]> = {
  manrope: [600, 700, 800],
  literata: [400, 700],
  "jetbrains mono": [400],
};

function stripFrontMatter(body: string): string {
  return body.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

/** Serializes body HTML into well-formed XHTML markup. Parsing through
    the HTML parser then XMLSerializer self-closes void elements and
    namespaces everything into XHTML. Throws if the result isn't
    well-formed (caught by the caller, which falls back to a toast). */
function toXhtml(headExtra: string, bodyHtml: string, title: string, bodyClass: string): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>${headExtra}</head><body class="${bodyClass}">${bodyHtml}</body></html>`,
    "text/html",
  );
  doc.documentElement.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const xml = new XMLSerializer().serializeToString(doc.documentElement);
  const out = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  // Guard: reject markup a reading system would refuse to open.
  const check = new DOMParser().parseFromString(out, "application/xhtml+xml");
  if (check.querySelector("parsererror")) throw new Error("EPUB content is not well-formed XHTML");
  return out;
}

/** Font faces to embed: reuse the bundled @font-face blocks (correct
    family/weight/style/unicode-range) but rewrite the URL to a relative
    path inside the EPUB, filtered to the curated weights and the scripts
    the document uses. Returns the rewritten CSS and the files to pack. */
async function collectFonts(text: string): Promise<{ css: string; files: { path: string; bytes: Uint8Array }[] }> {
  const css = await (await fetch(FONT_CSS_URL)).text();
  const wantExt = LATIN_EXT_RE.test(text);
  const wantDev = DEVANAGARI_RE.test(text);
  const blocks = css.match(FACE_RE) ?? [];
  const cssParts: string[] = [];
  const files: { path: string; bytes: Uint8Array }[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const family = block.match(/font-family:\s*['"]?([^;'"]+)['"]?/i)?.[1]?.trim().toLowerCase();
    const url = block.match(URL_RE)?.[1];
    if (!family || !url) continue;
    const weight = Number(block.match(/font-weight:\s*(\d+)/i)?.[1] ?? "400");
    const isDev = url.includes("devanagari");
    const isExt = url.includes("latin-ext");
    if (isDev) {
      if (!wantDev) continue;
    } else {
      if (!EPUB_WEIGHTS[family]?.includes(weight)) continue;
      if (isExt && !wantExt) continue;
    }
    const base = url.split("/").pop()!;
    if (!seen.has(base)) {
      seen.add(base);
      files.push({ path: `fonts/${base}`, bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()) });
    }
    cssParts.push(block.replace(URL_RE, () => `url('fonts/${base}')`));
  }
  return { css: cssParts.join("\n"), files };
}

/** Title page — a simple, reflow-friendly stand-in for the print cover
    (whose full-bleed fixed geometry doesn't belong in a reflowable book). */
function titlePageHtml(doc: Doc, brand: BrandConfig): string {
  const meta = [doc.exam, doc.paper, doc.session].filter(Boolean).map((m) => escapeHtml(m)).join(" · ");
  const author = escapeHtml(doc.author || brand.author);
  return `<section class="epub-title">
  <p class="epub-title__kicker">${escapeHtml(doc.institute?.trim() || brand.name)}</p>
  <h1 class="epub-title__h1">${escapeHtml(doc.title || "Untitled")}</h1>
  ${doc.subtitle ? `<p class="epub-title__sub">${escapeHtml(doc.subtitle)}</p>` : ""}
  ${meta ? `<p class="epub-title__meta">${meta}</p>` : ""}
  <p class="epub-title__by">${author}</p>
</section>`;
}

/** Closing colophon — website + social links, the pageless "back cover". */
function colophonHtml(brand: BrandConfig): string {
  const site = brand.website.replace(/^https?:\/\//, "");
  const links = [
    brand.telegram.url ? `<a href="${escapeHtml(brand.telegram.url)}">${escapeHtml(brand.telegram.label || "Telegram")}</a>` : "",
    brand.whatsapp.url ? `<a href="${escapeHtml(brand.whatsapp.url)}">${escapeHtml(brand.whatsapp.label || "WhatsApp")}</a>` : "",
  ].filter(Boolean);
  return `<section class="epub-colophon">
  <hr/>
  <p class="epub-colophon__name">${escapeHtml(brand.name)}</p>
  <p class="epub-colophon__tag">${escapeHtml(brand.tagline)}</p>
  <p class="epub-colophon__site"><a href="${escapeHtml(brand.website)}">${escapeHtml(site)}</a></p>
  ${links.length ? `<p class="epub-colophon__social">${links.join(" · ")}</p>` : ""}
</section>`;
}

/** Navigation entries — the reader's TOC/bookmarks. Question Banks use
    their titled units; prose templates use the heading TOC. */
function navEntries(doc: Doc): { href: string; label: string }[] {
  if (doc.template === "questions") {
    const parsed = parseMcq(doc.body);
    const entries: { href: string; label: string }[] = [];
    parsed.sections.forEach((s, i) => {
      if (s.title.trim() && s.questions.length) entries.push({ href: `index.xhtml#sec-${i + 1}`, label: s.title.trim() });
    });
    return entries;
  }
  return extractToc(doc.body)
    .filter((t) => t.level <= 2)
    .map((t) => ({ href: `index.xhtml#${t.id}`, label: t.text }));
}

const EPUB_CSS_EXTRA = `
html, body { margin: 0; padding: 0; }
body { padding: 1em 1.1em 2.5em; }
.epub-title { text-align: center; padding: 12% 1em; break-after: page; }
.epub-title__kicker { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.8em; color: var(--c-accent); }
.epub-title__h1 { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 800; font-size: 2.1em; color: var(--c-primary); margin: 0.6em 0 0; border: none; padding: 0; }
.epub-title__h1::before { display: none; }
.epub-title__sub { font-style: italic; color: var(--c-muted); font-size: 1.1em; margin: 0.5em 0 0; }
.epub-title__meta { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 700; letter-spacing: 0.04em; color: var(--c-muted); margin-top: 1.4em; font-size: 0.85em; }
.epub-title__by { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 700; color: var(--c-primary); margin-top: 0.4em; }
.epub-colophon { text-align: center; margin-top: 3em; break-before: page; }
.epub-colophon hr { border: none; border-top: 1.2pt solid var(--c-primary); width: 44pt; margin: 0 auto 1.2em; }
.epub-colophon__name { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 800; font-size: 1.35em; color: var(--c-primary); margin: 0; }
.epub-colophon__tag { font-style: italic; color: var(--c-muted); margin: 0.2em 0 0; }
.epub-colophon__site { font-family: "JetBrains Mono", monospace; color: var(--c-accent); margin: 0.9em 0 0; }
.epub-colophon__social { font-family: "Manrope", "Noto Sans Devanagari", sans-serif; font-weight: 700; margin: 0.6em 0 0; }
/* Reading systems ignore @page; keep the body flowing edge to edge. */
.toc, .qb-index, .answer-key, .explanations { break-before: auto; }`;

export async function buildEpub(doc: Doc, brand: BrandConfig, fileTitle: string, theme: "light" | "dark"): Promise<Blob> {
  const clean: Doc = { ...doc, body: stripFrontMatter(doc.body) };
  const built = TEMPLATE_RENDERERS[clean.template].buildBody(clean);

  const contentHtml = `${titlePageHtml(clean, brand)}
${built.frontMatter ?? ""}
${built.html}
${colophonHtml(brand)}`;

  // Fonts (referenced files, script-filtered + curated weights).
  const { css: fontCss, files: fontFiles } = await collectFonts(new DOMParser().parseFromString(contentHtml, "text/html").body.textContent ?? "");

  const styleCss = `:root { ${themeVars(brand, theme)}
  --body-size: 1em;
  --body-leading: 1.62;
}
${fontCss}
${printBaseCss}
${TEMPLATE_RENDERERS[clean.template].css}
${EPUB_CSS_EXTRA}`;

  const bodyClass = `tpl-${clean.template} mode-flow${theme === "dark" ? " doc-dark" : ""}`;
  const contentXhtml = toXhtml(`<link rel="stylesheet" type="text/css" href="style.css"/>`, contentHtml, clean.title || "Untitled", bodyClass);

  // Navigation document (EPUB 3 nav — the reader's TOC & bookmarks).
  const entries = navEntries(clean);
  const navList = entries.length
    ? entries.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.label)}</a></li>`).join("\n      ")
    : `<li><a href="index.xhtml">${escapeHtml(clean.title || "Untitled")}</a></li>`;
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${clean.lang === "hi" ? "hi" : "en"}">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      ${navList}
    </ol>
  </nav>
</body>
</html>`;

  const bookId = `urn:uuid:${uid()}-${uid()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const author = clean.author || brand.author;
  const lang = clean.lang === "hi" ? "hi" : "en";

  const fontManifest = fontFiles
    .map((f, i) => `<item id="font${i}" href="${f.path}" media-type="font/woff2"/>`)
    .join("\n    ");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(bookId)}</dc:identifier>
    <dc:title>${escapeHtml(clean.title || fileTitle || "Untitled")}</dc:title>
    <dc:language>${lang}</dc:language>
    <dc:creator>${escapeHtml(author)}</dc:creator>
    <dc:publisher>${escapeHtml(brand.name)}</dc:publisher>
    ${clean.subtitle ? `<dc:description>${escapeHtml(clean.subtitle)}</dc:description>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="index.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${fontManifest}
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const enc = new TextEncoder();
  const entriesZip: ZipEntry[] = [
    // The mimetype entry must be first and uncompressed (STORED) — the ZIP
    // writer is STORED-only, so this is satisfied by ordering alone.
    { name: "mimetype", data: enc.encode("application/epub+zip") },
    { name: "META-INF/container.xml", data: enc.encode(container) },
    { name: "OEBPS/content.opf", data: enc.encode(opf) },
    { name: "OEBPS/nav.xhtml", data: enc.encode(navXhtml) },
    { name: "OEBPS/index.xhtml", data: enc.encode(contentXhtml) },
    { name: "OEBPS/style.css", data: enc.encode(styleCss) },
    ...fontFiles.map((f) => ({ name: `OEBPS/${f.path}`, data: f.bytes })),
  ];
  return buildZip(entriesZip);
}
