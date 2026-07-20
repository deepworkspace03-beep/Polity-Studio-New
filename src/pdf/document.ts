import type { BrandConfig, CoverColors, CoverDesign, CoverPattern, Doc, PageSize } from "../lib/types";
import { DEFAULT_COVER_DESIGN } from "../brand/defaults";
import { escapeHtml } from "../lib/utils";
import { coverPatternSvg, type CoverPatternKind, telegramIconSvg, templeEmblemSvg, templeMarkSvg, watermarkHtml, whatsappIconSvg } from "../brand/marks";
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

/** `margin` is the standard page frame; `marginUltra` is the Ultra
    Compact frame — reduced within safe limits (the running header and
    footer live inside these margins and still need their room). */
const PAGE_GEOMETRY: Record<PageSize, { w: number; h: number; size: string; margin: string; marginUltra: string }> = {
  a4: { w: 210, h: 297, size: "210mm 297mm", margin: "21mm 15mm 23mm 15mm", marginUltra: "17mm 12mm 19mm 12mm" },
  a5: { w: 148, h: 210, size: "148mm 210mm", margin: "16mm 12mm 18mm 12mm", marginUltra: "13.5mm 10mm 15.5mm 10mm" },
  letter: { w: 216, h: 279, size: "216mm 279mm", margin: "21mm 16mm 23mm 16mm", marginUltra: "17mm 13mm 19mm 13mm" },
};

/** Question Banks maximize questions per page: their page frame is
    trimmed further than prose templates (banks are consulted, not read
    cover-to-cover). The running header (~5mm) and footer lockup (~8mm)
    still sit comfortably inside these margins — verified against the
    chrome metrics in print-base.css. */
const QB_PAGE_MARGINS: Record<PageSize, { margin: string; marginUltra: string }> = {
  a4: { margin: "18mm 13mm 20mm 13mm", marginUltra: "15mm 11mm 17mm 11mm" },
  a5: { margin: "14mm 10mm 16mm 10mm", marginUltra: "12mm 9mm 14mm 9mm" },
  letter: { margin: "18mm 14mm 20mm 14mm", marginUltra: "15mm 12mm 17mm 12mm" },
};

/** Vector pattern layer per cover style (SVG so print stays vector).
    "custom" is absent — its pattern comes from the CoverDesign. */
const COVER_PATTERNS: Record<Exclude<Doc["layout"]["coverStyle"], "custom">, { kind: CoverPatternKind; color: string }> = {
  meridian: { kind: "globe", color: "rgba(216,184,120,0.08)" },
  aurora: { kind: "abstract", color: "rgba(255,255,255,0.09)" },
  eclipse: { kind: "geometry", color: "rgba(211,166,98,0.07)" },
};

/** Body size/leading per density. "ultra" additionally gets a
    density-ultra body class: the real work is layout-level tightening
    (spacing, margins, padding) in the print stylesheets — never just a
    smaller font. */
const DENSITY: Record<Doc["layout"]["density"], { size: string; leading: string }> = {
  ultra: { size: "10.9pt", leading: "1.44" },
  compact: { size: "11.6pt", leading: "1.52" },
  comfort: { size: "12.6pt", leading: "1.62" },
  relaxed: { size: "13.6pt", leading: "1.72" },
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
  --c-accentSoft: color-mix(in srgb, ${c.accent} 16%, #0F141B);
  --c-gold: color-mix(in srgb, ${c.gold} 68%, #F2DFAF);
  --c-text: #E1E7F0;
  --c-muted: #93A2B5;
  --c-paper: #0F141B;
  --c-band: #19212C;
  --c-edge: #2A3441;
  --c-danger: #E88C81;
  --c-warn: #E0B267;
  --c-good: #62C892;
  --c-mix: #0F141B;
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
    color for the accent-colored edition badge when the author picks a
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
  if (colors.accent) vars.push(`--cv-accent:${colors.accent}`, `--cv-edition-tx:${pickBadgeInk(colors.accent)}`);
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

const FRAME_STYLES = new Set<CoverDesign["frameStyle"]>(["none", "single", "shaded", "accent"]);
const TITLE_BOXES = new Set<CoverDesign["titleBox"]>(["none", "outline", "filled", "premium"]);
const PATTERNS = new Set<CoverPattern>(["none", "geometry", "abstract", "globe"]);

/** Sanitized copy of a stored design over the schema defaults. Values land
    in class names and the srcdoc's style attribute, so every enum and
    color is checked, never trusted. */
function resolveDesign(design: CoverDesign | undefined): CoverDesign {
  const d = { ...DEFAULT_COVER_DESIGN, ...design };
  return {
    ...d,
    bg1: safeHex(d.bg1, DEFAULT_COVER_DESIGN.bg1),
    bg2: safeHex(d.bg2, DEFAULT_COVER_DESIGN.bg2),
    ink: safeHex(d.ink, DEFAULT_COVER_DESIGN.ink),
    accent: safeHex(d.accent, DEFAULT_COVER_DESIGN.accent),
    angle: clampNum(d.angle, 0, 360, 160),
    // Retired patterns (grid, dots, lines, rings, weave, waves, mesh) fall
    // back to the nearest surviving premium texture.
    pattern: PATTERNS.has(d.pattern) ? d.pattern : "geometry",
    patternOpacity: clampNum(d.patternOpacity, 0, 0.3, 0.05),
    patternDensity: clampNum(d.patternDensity, 0.5, 2, 1),
    patternSize: clampNum(d.patternSize, 0.5, 2.5, 1),
    titleScale: clampNum(d.titleScale, 0.6, 1.5, 1),
    // frameStyle supersedes the legacy boolean — designs saved before it
    // existed fall back to `frame` (true = the single hairline). The retired
    // "double" variant migrates to the premium "shaded" frame.
    frameStyle: FRAME_STYLES.has(d.frameStyle)
      ? d.frameStyle
      : (d.frameStyle as string) === "double"
        ? "shaded"
        : d.frame
          ? "single"
          : "none",
    titleBox: TITLE_BOXES.has(d.titleBox) ? d.titleBox : "none",
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
    `--cv-edition-tx:${pickBadgeInk(d.accent)}`,
    `--cv-title-font:${font.replace(/"/g, "&quot;")}`,
    `--cv-title-scale:${d.titleScale}`,
  ].join(";")}"`;
}

function coverHtml(doc: Doc, brand: BrandConfig, defaultCoverLines: string[]): string {
  if (!doc.layout.cover) return "";
  // Exam / paper stay on the eyebrow; the Session moves up to the meta row
  // (where the edition used to sit) and the Edition becomes a small corner
  // badge — see cv-session / cv-edition below.
  const eyebrowParts = [doc.exam, doc.paper].filter(Boolean);
  const eyebrow = eyebrowParts.length ? `<p class="cv-eyebrow">${escapeHtml(eyebrowParts.join("  ·  "))}</p>` : "";
  const session = doc.session.trim() ? `<span class="cv-session">${escapeHtml(doc.session.trim())}</span>` : "";
  const edition = doc.edition.trim() ? `<span class="cv-edition">${escapeHtml(doc.edition.trim())}</span>` : "";
  const author = doc.author || brand.author;
  const institute = doc.institute?.trim() || brand.name;
  // Cover language badge — cover page only, never touches content. Four
  // states: English · हिन्दी · Both · None.
  const langBadge = (label: string, hindi = false) => `<span class="cv-lang${hindi ? " cv-lang--hi" : ""}">${label}</span>`;
  const langLabel =
    doc.lang === "hi"
      ? langBadge("हिन्दी", true)
      : doc.lang === "en"
        ? langBadge("English")
        : doc.lang === "both"
          ? langBadge("English") + langBadge("हिन्दी", true)
          : "";
  // Author-authored highlight lines override the template's defaults; an
  // explicit empty array hides them entirely.
  const coverLines = (doc.coverLines ?? defaultCoverLines).map((l) => l.trim()).filter(Boolean);
  const geo = PAGE_GEOMETRY[doc.layout.pageSize];

  // The four preset styles are CSS palettes; "custom" carries its whole
  // design on the doc and is rendered from inline --cv-* variables.
  const design = doc.layout.coverStyle === "custom" ? resolveDesign(doc.layout.coverDesign) : null;
  const pattern: { kind: CoverPatternKind; color: string; density?: number; size?: number } | null = design
    ? design.pattern === "none"
      ? null
      : { kind: design.pattern, color: hexToRgba(design.ink, design.patternOpacity), density: design.patternDensity, size: design.patternSize }
    : COVER_PATTERNS[doc.layout.coverStyle as Exclude<Doc["layout"]["coverStyle"], "custom">];
  const classes = [
    `cover--${doc.layout.coverStyle}`,
    design?.align === "center" ? "cover--center" : "",
    design && design.frameStyle !== "none" ? `cover--frame-${design.frameStyle}` : "",
    design && design.titleBox !== "none" ? `cover--tbox-${design.titleBox}` : "",
  ].filter(Boolean).join(" ");
  const styleAttr = design ? customCoverVars(design) : coverColorVars(doc.layout.coverColors);
  const emblem = design && !design.emblem ? "" : templeEmblemSvg("cv-emblem");
  const mark = design?.logo
    ? `<img class="cv-logo" src="${escapeHtml(design.logo)}" alt="">`
    : templeMarkSvg("13mm", "cv-mark");

  return `
<section class="cover ${classes}"${styleAttr}>
  ${pattern ? coverPatternSvg(pattern.kind, geo.w, geo.h, pattern.color, { density: pattern.density, size: pattern.size }) : ""}
  <div class="cv-shade" aria-hidden="true"></div>
  ${emblem}
  ${edition}
  <header class="cv-top">
    <div class="cv-pub">
      ${mark}
      <div class="cv-pub__words">
        <b>${escapeHtml(institute.toUpperCase())}</b>
        <span>${escapeHtml(brand.initiative)}</span>
      </div>
    </div>
    <div class="cv-top__meta">
      ${session}
    </div>
  </header>
  <div class="cv-body">
    <div class="cv-titlebox">
      ${eyebrow}
      <h1 class="cv-exam" data-edit="title">${escapeHtml(doc.title || "Untitled")}</h1>
      <p class="cv-guide${doc.subtitle ? "" : " cv-guide--empty"}" data-edit="subtitle" data-placeholder="Add a subtitle…">${escapeHtml(doc.subtitle)}</p>
    </div>
    ${coverLines.length ? `<ul class="cv-highlights">
      ${coverLines.map((h) => `<li>${escapeHtml(h)}</li>`).join("\n      ")}
    </ul>` : ""}
  </div>
  ${langLabel ? `<div class="cv-langs">${langLabel}</div>` : ""}
  <div class="cv-foot">
    <a class="cv-foot__site" href="${escapeHtml(brand.website)}">${escapeHtml(brand.website.replace(/^https?:\/\//, ""))}</a>
    <div class="cv-foot__jrf"><span>${escapeHtml(author)}</span></div>
  </div>
</section>`;
}

/* ── Table of contents ─────────────────────────────────────────────── */

function tocHtml(doc: Doc): string {
  if (!TEMPLATE_META[doc.template].hasToc || !doc.layout.toc) return "";
  const toc = extractToc(doc.body);
  if (toc.length === 0) return "";
  return `
<nav class="toc">
  <h2 class="toc__title">Contents</h2>
  <ol class="toc__list">
    ${toc
      .map(
        (t) => `<li class="toc__item toc__item--l${t.level}">
      <a href="#${t.id}"><span class="toc__text">${escapeHtml(t.text)}</span><span class="toc__dots"></span><span class="toc__page"></span></a>
    </li>`,
      )
      .join("\n")}
  </ol>
</nav>`;
}

/* ── Page chrome (running header/footer sources) ───────────────────── */

function runnersHtml(doc: Doc, brand: BrandConfig): string {
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
<div class="run-head-book">${escapeHtml(doc.exam || brand.name)}</div>
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
/* Laid-out pages (.p-settled, stamped by the harness) skip off-screen
   rendering work entirely — style, layout and paint cost stay flat as the
   document grows, which is what keeps a 1000-page preview scrollable on a
   tablet. Every page keeps its explicit Paged.js size, so scrollbars, page
   navigation and fit-zoom stay exact; geometry APIs still measure skipped
   pages correctly (the PDF transcriber additionally forces each page
   visible while walking it, see engine/transcribe.ts). */
body.purpose-preview .pagedjs_page.p-settled { content-visibility: auto; }
/* NOTE: Paged.js is a print polyfill — it applies @media print rules to
   the paginated screen document too, so an !important zoom reset here
   would permanently disable the preview's zoom controls. The harness
   resets zoom imperatively around window.print() instead. */
@media print {
  body.purpose-preview { background: none; }
  body.purpose-preview .pagedjs_pages { gap: 0; padding: 0; }
  body.purpose-preview .pagedjs_page { box-shadow: none; }
  /* Chrome can skip content-visibility:auto subtrees when printing —
     every page must render in the print fallback. */
  body.purpose-preview .pagedjs_page.p-settled { content-visibility: visible; }
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
.cv-guide--empty { display: block !important; }`;

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
    doc.lang,
    theme,
    Object.values(brand.colors).join(","),
  ].join("|");
}

/** Identity of a document's *pagination geometry* — everything that can
    change the real page count. When a Paged.js layout completes, its
    exact count is stored under this key (see Editor.tsx's page-count
    authority chain); any change here invalidates it. Body text is
    tracked separately so an unchanged-body match can report the count
    as exact rather than calibrated. */
export function pageFactKey(doc: Doc, brand: BrandConfig, theme: "light" | "dark" = "light"): string {
  return [
    doc.id,
    buildShellKey(doc, brand, theme),
    doc.layout.cover,
    doc.layout.toc,
    doc.layout.answers,
    // Question-bank layout switches all move real page breaks.
    doc.layout.qbUnitBreaks !== false,
    doc.layout.qbTopics !== false,
    doc.layout.qbColumns ?? 1,
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

  const ultra = doc.layout.density === "ultra";
  const frame = doc.template === "questions" ? QB_PAGE_MARGINS[doc.layout.pageSize] : geometry;
  const css = `
:root { ${themeVars(brand, theme)}
  --body-size: ${density.size};
  --body-leading: ${density.leading};
}
@page { size: ${geometry.size}; margin: ${ultra ? frame.marginUltra : frame.margin}; }
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
  // Pagination must measure with the real fonts: the polyfill auto-starts
  // at DOMContentLoaded, before font-display:swap faces finish, so breaks
  // would otherwise be computed with fallback metrics and the count could
  // drift run to run. In practice the app shell has already warmed every
  // Latin face (same-origin memory cache), but Devanagari faces load only
  // when a document first uses them — this makes that first layout
  // deterministic too. The 5 s race keeps a failed font from stalling
  // layout forever (fonts.ready resolves on failure, belt and braces).
  // Flow + export is the script-free build: the print fallback and the
  // standalone web (pageless) HTML export must carry no inline-editing
  // harness — an exported reading file with contenteditable headings
  // would be a defect, not a feature.
  const scripts = paged
    ? `<script>window.PagedConfig = { auto: true, before: function () {
  return Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 5000); })]);
} };</script>
<script src="/vendor/paged.polyfill.min.js"></script>
<script>${HARNESS_JS}</script>`
    : purpose === "export"
      ? ""
      : `<script>${PREVIEW_JS}</script>`;

  const content = `${coverHtml(doc, brand, body.coverLines)}
${paged ? runnersHtml(doc, brand) : ""}
${tocHtml(doc)}
${body.html}`;

  const title = options.fileTitle || doc.title || "Untitled";

  return `<!DOCTYPE html>
<html lang="${doc.lang === "hi" ? "hi" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>${css}</style>
${watermarkTemplate}
</head>
<body class="tpl-${doc.template} mode-${mode} purpose-${purpose} density-${doc.layout.density} size-${doc.layout.pageSize}${theme === "dark" ? " doc-dark" : ""}" data-watermark="${doc.layout.watermark ? "1" : "0"}" data-purpose="${purpose}">
${paged ? content : `<div id="doc-root">${content}</div>`}
${scripts}
</body>
</html>`;
}
