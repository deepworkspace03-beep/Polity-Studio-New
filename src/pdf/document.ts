import type { BrandConfig, CoverColors, CoverDesign, Doc, PageSize } from "../lib/types";
import { DEFAULT_COVER_DESIGN } from "../brand/defaults";
import { escapeHtml } from "../lib/utils";
import { coverPatternSvg, telegramIconSvg, templeEmblemSvg, templeMarkSvg, watermarkHtml, whatsappIconSvg } from "../brand/marks";
import { extractToc } from "../markdown/renderer";
import { TEMPLATE_RENDERERS } from "../templates";
import { TEMPLATE_META } from "../templates/meta";
import printBaseCss from "./styles/print-base.css?raw";
import coversCss from "./styles/covers.css?raw";
import { HARNESS_JS, PREVIEW_JS } from "./harness";

/**
 * Builds the complete, self-contained HTML for a document. The same
 * builder feeds the flow preview, the paged preview and the PDF export,
 * so what you see is always what prints.
 *
 *   flow  — continuous scroll, no pagination (fast live preview);
 *           content lives in #doc-root and is refreshed in place via
 *           postMessage so typing never rebuilds the iframe
 *   paged — Paged.js pagination with running headers/footers, page
 *           numbers, TOC page numbers and per-page watermark
 */

export type BuildMode = "flow" | "paged";

export interface BuildOptions {
  mode: BuildMode;
  /** paged only: preview scales pages to fit; export keeps 1:1 print geometry. */
  purpose?: "preview" | "export";
  /** Document title override used as the print/PDF filename. */
  fileTitle?: string;
  /** Reading theme — "dark" renders the document on a dark, eye-friendly
      palette (previews, PDF and HTML alike). Covers keep their own design. */
  theme?: "light" | "dark";
}

// Bottom margins are 6mm smaller than before, with the difference moved to
// print-base.css's .pagedjs_page_content padding-bottom — the footer's own
// real estate is unchanged, but content now gets the same breathing room
// above the bottom divider that it already had below the top divider (see
// print-base.css § page balance).
const PAGE_GEOMETRY: Record<PageSize, { w: number; h: number; size: string; margin: string }> = {
  a4: { w: 210, h: 297, size: "210mm 297mm", margin: "21mm 15mm 17mm 15mm" },
  a5: { w: 148, h: 210, size: "148mm 210mm", margin: "16mm 12mm 12mm 12mm" },
  letter: { w: 216, h: 279, size: "216mm 279mm", margin: "21mm 16mm 17mm 16mm" },
};

/** Vector pattern layer per cover style (SVG so print stays vector).
    "custom" is absent — its pattern comes from the CoverDesign. */
const COVER_PATTERNS: Record<Exclude<Doc["layout"]["coverStyle"], "custom">, { kind: "grid" | "rings" | "weave" | "lines"; color: string }> = {
  regal: { kind: "grid", color: "rgba(245,242,234,0.035)" },
  aurora: { kind: "rings", color: "rgba(255,255,255,0.07)" },
  heritage: { kind: "lines", color: "rgba(26,39,64,0.055)" },
  eclipse: { kind: "rings", color: "rgba(211,166,98,0.065)" },
};

/** Per-density sizing. compact/comfort/relaxed keep their exact historical
    values for qGap/qPad/paraGap/secGap/optGap (only size/leading differ
    between them, as before) — ultra is the only tier that also tightens
    spacing, so it reads denser without shrinking type aggressively. */
const DENSITY: Record<
  Doc["layout"]["density"],
  { size: string; leading: string; qGap: string; qPad: string; paraGap: string; secGap: string; optGap: string }
> = {
  ultra: { size: "10.8pt", leading: "1.4", qGap: "0.5em", qPad: "0.55em 0.75em 0.6em", paraGap: "0.55em", secGap: "1.05em 0 0.6em", optGap: "1.5pt 8pt" },
  compact: { size: "11.6pt", leading: "1.52", qGap: "0.85em", qPad: "0.75em 0.95em 0.8em", paraGap: "0.85em", secGap: "1.6em 0 1em", optGap: "2.5pt 10pt" },
  comfort: { size: "12.6pt", leading: "1.62", qGap: "0.85em", qPad: "0.75em 0.95em 0.8em", paraGap: "0.85em", secGap: "1.6em 0 1em", optGap: "2.5pt 10pt" },
  relaxed: { size: "13.6pt", leading: "1.72", qGap: "0.85em", qPad: "0.75em 0.95em 0.8em", paraGap: "0.85em", secGap: "1.6em 0 1em", optGap: "2.5pt 10pt" },
};

function themeVars(brand: BrandConfig, theme: "light" | "dark"): string {
  const c = brand.colors;
  if (theme === "dark") {
    // Dark reading theme — a deliberate visual design, not an inversion.
    // A deep, slightly-cool ink ground (#0F141B) with two lifted surface
    // steps (band/edge) gives real depth without halation; text is a soft
    // off-white rather than pure white to calm contrast on long reads.
    // Brand hues are lightened with color-mix so headings and accents keep
    // their identity on the dark ground. Because --c-primary is now a
    // *light* tint here, table headers flip their ink dark (--c-th-ink)
    // so a light-blue header band stays legible — the one relationship
    // that silently broke in the previous palette.
    return `
  --c-primary: color-mix(in srgb, ${c.primary} 26%, #D7E4F6);
  --c-primarySoft: color-mix(in srgb, ${c.primarySoft} 34%, #C4D6EE);
  --c-accent: color-mix(in srgb, ${c.accent} 68%, #C9EEEA);
  --c-accentSoft: color-mix(in srgb, ${c.accent} 22%, #19212C);
  --c-gold: color-mix(in srgb, ${c.gold} 68%, #F2DFAF);
  --c-text: #DDE4EE;
  --c-muted: #8B99AB;
  --c-paper: #0F141B;
  --c-band: #19212C;
  --c-edge: #313D4C;
  --c-danger: #E88C81;
  --c-warn: #E0B267;
  --c-good: #62C892;
  --c-mix: #19212C;
  --c-th-ink: #0F141B;`;
  }
  return `
  --c-primary: ${c.primary};
  --c-primarySoft: ${c.primarySoft};
  --c-accent: ${c.accent};
  --c-accentSoft: ${c.accentSoft};
  --c-gold: ${c.gold};
  --c-text: #1B2431;
  --c-muted: #5B6672;
  --c-paper: #FFFFFF;
  --c-band: #F1F5F9;
  --c-edge: #DCE4EC;
  --c-danger: #B4433A;
  --c-warn: #B07C24;
  --c-good: #177245;
  --c-mix: #FFFFFF;
  --c-th-ink: #FFFFFF;`;
}

/* ── Cover ─────────────────────────────────────────────────────────── */

/** Relative luminance of a #rrggbb color, used to pick a legible ink
    color for the accent-colored session badge when the author picks a
    custom accent (the four preset styles already choose this by hand). */
function pickBadgeInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#141414";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  return L > 0.5 ? "#141414" : "#ffffff";
}

/** Inline custom-property overrides for the author's optional cover
    color overrides (Details → Cover colors) — absent fields fall
    through to the chosen style's own palette untouched. */
function coverColorVars(colors: CoverColors | undefined): string {
  if (!colors) return "";
  const vars: string[] = [];
  if (colors.bg) vars.push(`--cv-bg:${colors.bg}`);
  if (colors.ink) vars.push(`--cv-ink:${colors.ink}`, `--cv-line:color-mix(in srgb, ${colors.ink} 32%, transparent)`);
  if (colors.accent) vars.push(`--cv-accent:${colors.accent}`, `--cv-session-tx:${pickBadgeInk(colors.accent)}`);
  return vars.length ? ` style="${vars.join(";")}"` : "";
}

/* ── Custom cover (the Cover Designer) ─────────────────────────────── */

/** Designs come from the UI's color inputs, but also from restored JSON
    backups — accept only literal hex colors before injecting them into
    the srcdoc's style attribute. */
function safeHex(c: unknown, fallback: string): string {
  return typeof c === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim()) ? c.trim() : fallback;
}

function clampNum(n: unknown, min: number, max: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.slice(1);
  const full = h.length <= 4 ? [...h].map((ch) => ch + ch).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
}

/** Sanitized copy of a stored design over the schema defaults. */
function resolveDesign(design: CoverDesign | undefined): CoverDesign {
  const d = { ...DEFAULT_COVER_DESIGN, ...design };
  return {
    ...d,
    bg1: safeHex(d.bg1, DEFAULT_COVER_DESIGN.bg1),
    bg2: safeHex(d.bg2, DEFAULT_COVER_DESIGN.bg2),
    ink: safeHex(d.ink, DEFAULT_COVER_DESIGN.ink),
    accent: safeHex(d.accent, DEFAULT_COVER_DESIGN.accent),
    angle: clampNum(d.angle, 0, 360, 160),
    patternOpacity: clampNum(d.patternOpacity, 0, 0.3, 0.05),
    titleScale: clampNum(d.titleScale, 0.6, 1.5, 1),
    logo: typeof d.logo === "string" && d.logo.startsWith("data:image/") ? d.logo : undefined,
  };
}

function customCoverVars(d: CoverDesign): string {
  const bg = d.bg1.toLowerCase() === d.bg2.toLowerCase() ? d.bg1 : `linear-gradient(${d.angle}deg, ${d.bg1} 0%, ${d.bg2} 100%)`;
  const font = d.titleFont === "sans" ? '"Manrope", "Noto Sans Devanagari", sans-serif' : '"Literata", "Noto Serif Devanagari", serif';
  return ` style="${[
    `--cv-bg:${bg}`,
    `--cv-ink:${d.ink}`,
    `--cv-soft:color-mix(in srgb, ${d.ink} 78%, transparent)`,
    `--cv-accent:${d.accent}`,
    `--cv-line:color-mix(in srgb, ${d.ink} 30%, transparent)`,
    `--cv-session-tx:${pickBadgeInk(d.accent)}`,
    `--cv-title-font:${font.replace(/"/g, "&quot;")}`,
    `--cv-title-scale:${d.titleScale}`,
  ].join(";")}"`;
}

function coverHtml(doc: Doc, brand: BrandConfig, defaultCoverLines: string[]): string {
  if (!doc.layout.cover) return "";
  // Universal carries no fixed branding — the publisher lockup, temple
  // emblem and footer website link only render for the other templates;
  // the author's own institute (if set) is the only identity shown.
  const isUniversal = doc.template === "universal";
  const eyebrowParts = [doc.exam, doc.paper].filter(Boolean);
  const eyebrow = eyebrowParts.length ? `<p class="cv-eyebrow">${escapeHtml(eyebrowParts.join("  ·  "))}</p>` : "";
  const author = doc.author || (isUniversal ? "" : brand.author);
  const institute = doc.institute?.trim() || (isUniversal ? "" : brand.name);
  // Language badge — secondary metadata, rendered in the footer (not the
  // top-right corner) so it never competes with the title. "both" shows
  // both labels, "none" shows neither.
  const langLabel =
    doc.lang === "both"
      ? `<span class="cv-lang-badge">हिन्दी</span><span class="cv-lang-badge">English</span>`
      : doc.lang === "hi"
        ? `<span class="cv-lang-badge">हिन्दी</span>`
        : doc.lang === "en"
          ? `<span class="cv-lang-badge">English</span>`
          : "";
  const editionBadge = doc.edition?.trim() ? `<span class="cv-edition-badge">${escapeHtml(doc.edition.trim())}</span>` : "";
  // Author-authored highlight lines override the template's defaults; an
  // explicit empty array hides them entirely.
  const coverLines = (doc.coverLines ?? defaultCoverLines).map((l) => l.trim()).filter(Boolean);
  const geo = PAGE_GEOMETRY[doc.layout.pageSize];

  // The four preset styles are CSS palettes; "custom" carries its whole
  // design on the doc and is rendered from inline --cv-* variables.
  const design = doc.layout.coverStyle === "custom" ? resolveDesign(doc.layout.coverDesign) : null;
  const pattern = design
    ? design.pattern === "none"
      ? null
      : { kind: design.pattern, color: hexToRgba(design.ink, design.patternOpacity) }
    : COVER_PATTERNS[doc.layout.coverStyle as Exclude<Doc["layout"]["coverStyle"], "custom">];
  const classes = [
    `cover--${doc.layout.coverStyle}`,
    design?.align === "center" ? "cover--center" : "",
    design?.frame ? "cover--framed" : "",
  ].filter(Boolean).join(" ");
  const styleAttr = design ? customCoverVars(design) : coverColorVars(doc.layout.coverColors);
  const emblem = isUniversal || (design && !design.emblem) ? "" : templeEmblemSvg("cv-emblem");
  const mark = isUniversal
    ? ""
    : design?.logo
      ? `<img class="cv-logo" src="${escapeHtml(design.logo)}" alt="">`
      : templeMarkSvg("13mm", "cv-mark");
  const pub =
    mark || institute
      ? `<div class="cv-pub">
      ${mark}
      <div class="cv-pub__words">
        ${institute ? `<b>${escapeHtml(institute.toUpperCase())}</b>` : ""}
        ${isUniversal ? "" : `<span>${escapeHtml(brand.initiative)}</span>`}
      </div>
    </div>`
      : "<div></div>";
  const site = isUniversal
    ? ""
    : `<a class="cv-foot__site" href="${escapeHtml(brand.website)}">${escapeHtml(brand.website.replace(/^https?:\/\//, ""))}</a>`;

  return `
<section class="cover ${classes}"${styleAttr}>
  ${pattern ? coverPatternSvg(pattern.kind, geo.w, geo.h, pattern.color) : ""}
  <div class="cv-shade" aria-hidden="true"></div>
  ${emblem}
  ${editionBadge}
  <header class="cv-top">
    ${pub}
    <div class="cv-top__meta">
      <span class="cv-session">${escapeHtml(doc.session || String(new Date().getFullYear()))}</span>
    </div>
  </header>
  <div class="cv-body">
    ${eyebrow}
    <h1 class="cv-exam" data-edit="title">${escapeHtml(doc.title || "Untitled")}</h1>
    <p class="cv-guide${doc.subtitle ? "" : " cv-guide--empty"}" data-edit="subtitle" data-placeholder="Add a subtitle…">${escapeHtml(doc.subtitle)}</p>
    ${coverLines.length ? `<ul class="cv-highlights">
      ${coverLines.map((h) => `<li>${escapeHtml(h)}</li>`).join("\n      ")}
    </ul>` : ""}
  </div>
  <div class="cv-foot">
    ${site || "<span></span>"}
    ${langLabel ? `<div class="cv-foot__lang">${langLabel}</div>` : ""}
    ${author ? `<div class="cv-foot__jrf"><span>${escapeHtml(author)}</span></div>` : "<span></span>"}
  </div>
</section>`;
}

/* ── Table of contents ─────────────────────────────────────────────── */

function tocHtml(doc: Doc): string {
  // Flashcard-style Revision has no meaningful TOC — every "##" is a card
  // front, not a section — so it never had one even before templates
  // were consolidated; keep that behavior regardless of layout.toc.
  const isFlashcards = doc.template === "revision" && doc.layout.revisionStyle === "cards";
  if (!TEMPLATE_META[doc.template].hasToc || isFlashcards || !doc.layout.toc) return "";
  const toc = extractToc(doc.body);
  if (toc.length === 0) return "";
  return `
<nav class="toc">
  <h2 class="toc__title">Contents</h2>
  <ol class="toc__list">
    ${toc
      .map(
        (t) => `<li class="toc__item toc__item--l${t.level}">
      <a href="#${t.id}"><span class="toc__text">${escapeHtml(t.text)}</span><span class="toc__dots"></span></a>
    </li>`,
      )
      .join("\n")}
  </ol>
</nav>`;
}

/* ── Page chrome (running header/footer sources) ───────────────────── */

function runnersHtml(doc: Doc, brand: BrandConfig): string {
  // Universal keeps the running header (the document's own subject, not
  // the brand name) but drops the branded footer lockup/site/social
  // icons entirely — only the page-number margin box (print-base.css,
  // not sourced from here) remains.
  const isUniversal = doc.template === "universal";
  const headBook = doc.exam || (isUniversal ? doc.title : brand.name);
  if (isUniversal) {
    return `
<div class="run-head-book">${escapeHtml(headBook || "")}</div>
<div class="run-head-topic"></div>
<div class="run-foot-brand"></div>
<div class="run-foot-site"></div>
<div class="run-foot-social"></div>`;
  }
  const site = brand.website.replace(/^https?:\/\//, "");
  const social = [
    brand.telegram.url
      ? `<a class="run-social" href="${escapeHtml(brand.telegram.url)}" aria-label="Telegram">${telegramIconSvg("run-social__icon")}</a>`
      : "",
    brand.whatsapp.url
      ? `<a class="run-social" href="${escapeHtml(brand.whatsapp.url)}" aria-label="WhatsApp">${whatsappIconSvg("run-social__icon")}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("\n  ");
  return `
<div class="run-head-book">${escapeHtml(headBook)}</div>
<div class="run-head-topic"></div>
<div class="run-foot-brand">
  ${templeMarkSvg("15pt", "run-foot-brand__mark")}
  <span class="run-foot-brand__words">
    <b>${escapeHtml(brand.name)}</b>
    <span>${escapeHtml(brand.tagline)}</span>
  </span>
</div>
<div class="run-foot-site"><a href="${escapeHtml(brand.website)}">${escapeHtml(site)}</a></div>
<div class="run-foot-social">${social}</div>`;
}

/* ── Assembly ──────────────────────────────────────────────────────── */

/** Extra styles for the on-screen paged preview: dark desk, centered
    pages, drop shadows. Export keeps pristine print geometry. */
const PAGED_PREVIEW_CSS = `
body.purpose-preview { background: #262b34; }
body.purpose-preview .pagedjs_pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px 12px 80px;
  width: fit-content;
  margin: 0 auto;
}
body.purpose-preview .pagedjs_page {
  box-shadow: 0 3px 18px rgba(0, 0, 0, 0.4);
  flex: none;
}
/* Always-visible, draggable scrollbar — Android Chrome's overlay
   scrollbar is invisible at rest and ungrabbable on touch. */
body.purpose-preview::-webkit-scrollbar { width: 12px; background: rgba(255,255,255,0.04); }
body.purpose-preview::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.28);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: padding-box;
  min-height: 44px;
}
/* Page navigator rail (built by the harness after layout): a scrub bar
   with page labels for jumping straight to a page in long documents. */
#x-nav-rail {
  position: fixed;
  top: 10px;
  bottom: 10px;
  right: 14px;
  width: 30px;
  z-index: 6;
  border-radius: 15px;
  background: rgba(13, 17, 23, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  touch-action: none;
  user-select: none;
  cursor: pointer;
}
#x-nav-rail .x-nav-tick {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font: 600 9px/1 system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.78);
  pointer-events: none;
  transform: translateY(-50%);
}
#x-nav-rail .x-nav-thumb {
  position: absolute;
  left: 3px;
  right: 3px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.22);
  pointer-events: none;
}
#x-nav-bubble {
  position: fixed;
  right: 52px;
  z-index: 7;
  transform: translateY(-50%);
  background: rgba(13, 17, 23, 0.92);
  color: #e6edf6;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 5px 9px;
  font: 700 12px/1 system-ui, sans-serif;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
/* NOTE: Paged.js is a print polyfill — it applies @media print rules to
   the paginated screen document too, so an !important zoom reset here
   would permanently disable the preview's zoom controls. The harness
   resets zoom imperatively around window.print() instead. */
@media print {
  body.purpose-preview { background: none; }
  body.purpose-preview .pagedjs_pages { gap: 0; padding: 0; }
  body.purpose-preview .pagedjs_page { box-shadow: none; }
  #x-nav-rail, #x-nav-bubble { display: none; }
}`;

/** Cursor-follow highlight + inline-editing affordances (flow only). */
const FLOW_PREVIEW_CSS = `
[data-line].preview-here {
  animation: preview-here 1.6s ease-out;
  border-radius: 4px;
}
@keyframes preview-here {
  0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-accent) 35%, transparent); }
  100% { box-shadow: 0 0 0 4px transparent; }
}
/* Inline editing: subtle hover hint, clear focus ring, placeholder. */
.inline-editable { border-radius: 4px; transition: box-shadow 0.12s, background 0.12s; cursor: text; }
.inline-editable:hover { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-accent) 22%, transparent); }
.inline-editable:focus { outline: none; box-shadow: 0 0 0 2px var(--c-accent); background: color-mix(in srgb, var(--c-accent) 7%, transparent); }
.cv-exam.inline-editable:hover, .cv-guide.inline-editable:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.4); }
.cv-exam.inline-editable:focus, .cv-guide.inline-editable:focus { box-shadow: 0 0 0 2px rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.cv-guide--empty::before, [data-edit]:empty::before {
  content: attr(data-placeholder);
  opacity: 0.55;
  font-style: italic;
}
.cv-guide--empty { display: block !important; }
/* Always-visible, draggable scrollbar (see PAGED_PREVIEW_CSS note). */
body::-webkit-scrollbar { width: 12px; background: transparent; }
body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--c-muted) 55%, transparent);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: padding-box;
  min-height: 44px;
}`;

/** Content pasted from other tools often carries YAML front matter —
    it is metadata, never body text, so drop it before rendering. */
function stripFrontMatter(body: string): string {
  return body.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

/** The document content that changes while typing: cover + TOC + body.
    The flow preview swaps this into #doc-root without a reload. */
export function buildDocContent(doc: Doc, brand: BrandConfig): string {
  doc = { ...doc, body: stripFrontMatter(doc.body) };
  const body = TEMPLATE_RENDERERS[doc.template].buildBody(doc);
  return `${coverHtml(doc, brand, body.coverLines)}
${tocHtml(doc)}
${body.html}`;
}

/** Everything that requires a full iframe rebuild when it changes —
    used by the preview to decide srcdoc reload vs in-place update. */
export function buildShellKey(doc: Doc, brand: BrandConfig, theme: "light" | "dark" = "light"): string {
  return [
    doc.template,
    doc.layout.pageSize,
    doc.layout.density,
    doc.layout.typography,
    doc.lang,
    theme,
    Object.values(brand.colors).join(","),
  ].join("|");
}

export function buildDocumentHtml(doc: Doc, brand: BrandConfig, options: BuildOptions): string {
  const { mode, purpose = "preview", theme = "light" } = options;
  doc = { ...doc, body: stripFrontMatter(doc.body) };
  const template = TEMPLATE_RENDERERS[doc.template];
  const body = template.buildBody(doc);
  const geometry = PAGE_GEOMETRY[doc.layout.pageSize];
  const density = DENSITY[doc.layout.density];
  const paged = mode === "paged";

  const bodyFont =
    doc.layout.typography === "sans"
      ? `"Manrope", "Noto Sans Devanagari", sans-serif`
      : `"Literata", "Noto Serif Devanagari", Georgia, serif`;

  const css = `
:root { ${themeVars(brand, theme)}
  --body-size: ${density.size};
  --body-leading: ${density.leading};
  --q-gap: ${density.qGap};
  --q-pad: ${density.qPad};
  --para-gap: ${density.paraGap};
  --sec-gap: ${density.secGap};
  --opt-gap: ${density.optGap};
  --font-body: ${bodyFont};
}
@page { size: ${geometry.size}; margin: ${geometry.margin}; }
${printBaseCss}
${coversCss}
${template.css}
${paged ? PAGED_PREVIEW_CSS : FLOW_PREVIEW_CSS}`;

  // The watermark template lives in <head>: any extra node in <body>
  // after the last section would earn its own blank trailing page
  // during pagination.
  const watermarkTemplate = paged
    ? `<template id="watermark-template">${watermarkHtml(brand.watermarkText)}</template>`
    : "";
  const scripts = paged
    ? `<script src="/vendor/paged.polyfill.min.js"></script>
<script>${HARNESS_JS}</script>`
    : `<script>${PREVIEW_JS}</script>`;

  const content = `${coverHtml(doc, brand, body.coverLines)}
${paged ? runnersHtml(doc, brand) : ""}
${tocHtml(doc)}
${body.html}`;

  const title = options.fileTitle || doc.title || "Untitled";

  return `<!DOCTYPE html>
<html lang="${doc.lang === "hi" || doc.lang === "both" ? "hi" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>${css}</style>
${watermarkTemplate}
</head>
<body class="tpl-${doc.template} mode-${mode} purpose-${purpose}${theme === "dark" ? " doc-dark" : ""}" data-watermark="${doc.layout.watermark && TEMPLATE_META[doc.template].hasWatermark ? "1" : "0"}" data-purpose="${purpose}">
${paged ? content : `<div id="doc-root">${content}</div>`}
${scripts}
</body>
</html>`;
}
