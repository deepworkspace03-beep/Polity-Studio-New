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

const PAGE_GEOMETRY: Record<PageSize, { w: number; h: number; size: string; margin: string }> = {
  a4: { w: 210, h: 297, size: "210mm 297mm", margin: "21mm 15mm 23mm 15mm" },
  a5: { w: 148, h: 210, size: "148mm 210mm", margin: "16mm 12mm 18mm 12mm" },
  letter: { w: 216, h: 279, size: "216mm 279mm", margin: "21mm 16mm 23mm 16mm" },
};

/** Vector pattern layer per cover style (SVG so print stays vector).
    "custom" is absent — its pattern comes from the CoverDesign. */
const COVER_PATTERNS: Record<Exclude<Doc["layout"]["coverStyle"], "custom">, { kind: "grid" | "rings" | "weave" | "lines"; color: string }> = {
  regal: { kind: "grid", color: "rgba(245,242,234,0.045)" },
  aurora: { kind: "rings", color: "rgba(255,255,255,0.09)" },
  heritage: { kind: "lines", color: "rgba(26,39,64,0.07)" },
  eclipse: { kind: "rings", color: "rgba(211,166,98,0.08)" },
};

/** Ultra tightens spacing rhythm as much as type size — the body class
    `density-ultra` carries the spacing deltas in print-base.css, so the
    font stays comfortably readable while pages hold visibly more. */
const DENSITY: Record<Doc["layout"]["density"], { size: string; leading: string }> = {
  ultra: { size: "10.9pt", leading: "1.42" },
  compact: { size: "11.6pt", leading: "1.52" },
  comfort: { size: "12.6pt", leading: "1.62" },
  relaxed: { size: "13.6pt", leading: "1.72" },
};

function themeVars(brand: BrandConfig, theme: "light" | "dark"): string {
  const c = brand.colors;
  if (theme === "dark") {
    // Dark reading theme — a deliberate visual design, not an inversion.
    // A deep, slightly-warm charcoal ground (#11161E) with two lifted
    // surface steps (band/edge) gives real depth without halation; text
    // is a soft warm off-white (not pure white) to calm contrast on long
    // reads, and muted ink stays readable at small caption sizes.
    // Brand hues are lightened with color-mix so headings and accents keep
    // their identity on the dark ground. Because --c-primary is now a
    // *light* tint here, table headers flip their ink dark (--c-th-ink)
    // so a light-blue header band stays legible — the one relationship
    // that silently broke in the previous palette. --c-card lifts
    // question cards and code blocks slightly off the page so the dark
    // theme keeps the same surface hierarchy the light theme gets from
    // borders alone.
    return `
  --c-primary: color-mix(in srgb, ${c.primary} 30%, #DCE7F7);
  --c-primarySoft: color-mix(in srgb, ${c.primarySoft} 38%, #C8D9EF);
  --c-accent: color-mix(in srgb, ${c.accent} 62%, #BFEDE8);
  --c-accentSoft: color-mix(in srgb, ${c.accent} 18%, #11161E);
  --c-gold: color-mix(in srgb, ${c.gold} 60%, #F3E2B8);
  --c-text: #E3E9F2;
  --c-muted: #96A3B5;
  --c-paper: #11161E;
  --c-band: #1B2330;
  --c-edge: #2D3846;
  --c-danger: #EA9188;
  --c-warn: #E3B76F;
  --c-good: #6FCE9C;
  --c-mix: #11161E;
  --c-card: #161D27;
  --c-th-ink: #101722;`;
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
  --c-card: #FFFFFF;
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
    `--cv-edition-tx:${pickBadgeInk(d.accent)}`,
    `--cv-title-font:${font.replace(/"/g, "&quot;")}`,
    `--cv-title-scale:${d.titleScale}`,
  ].join(";")}"`;
}

/** Cover language label — each of the four choices is explicit; "none"
    (the default) shows no label at all. */
function langLabelHtml(lang: Doc["lang"]): string {
  const text = lang === "hi" ? "हिन्दी" : lang === "en" ? "English" : lang === "both" ? "हिन्दी · English" : "";
  return text ? `<span class="cv-lang">${text}</span>` : "";
}

function coverHtml(doc: Doc, brand: BrandConfig, defaultCoverLines: string[]): string {
  if (!doc.layout.cover) return "";
  // Universal is brand-neutral: no institute fallback, no initiative
  // line, no emblem, no website — the cover carries only what the
  // author actually set on this document.
  const plain = !!TEMPLATE_META[doc.template].plainChrome;
  const eyebrowParts = [doc.exam, doc.paper].filter(Boolean);
  const eyebrow = eyebrowParts.length ? `<p class="cv-eyebrow">${escapeHtml(eyebrowParts.join("  ·  "))}</p>` : "";
  const author = doc.author || (plain ? "" : brand.author);
  const institute = doc.institute?.trim() || (plain ? "" : brand.name);
  const langLabel = langLabelHtml(doc.lang);
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
  const emblem = plain || (design && !design.emblem) ? "" : templeEmblemSvg("cv-emblem");
  const mark = design?.logo
    ? `<img class="cv-logo" src="${escapeHtml(design.logo)}" alt="">`
    : plain
      ? ""
      : templeMarkSvg("13mm", "cv-mark");
  const lockup = institute
    ? `<div class="cv-pub">
      ${mark}
      <div class="cv-pub__words">
        <b>${escapeHtml(institute.toUpperCase())}</b>
        ${plain ? "" : `<span>${escapeHtml(brand.initiative)}</span>`}
      </div>
    </div>`
    : `<div class="cv-pub"></div>`;
  const editionBadge = doc.edition?.trim() ? `<span class="cv-edition-badge">${escapeHtml(doc.edition.trim())}</span>` : "";
  // Universal shows a session pill only when the author set one; the
  // branded templates keep the current-year fallback.
  const session = doc.session || (plain ? "" : String(new Date().getFullYear()));
  const footer =
    plain && !author
      ? ""
      : `<div class="cv-foot">
    ${plain ? "<span></span>" : `<a class="cv-foot__site" href="${escapeHtml(brand.website)}">${escapeHtml(brand.website.replace(/^https?:\/\//, ""))}</a>`}
    <div class="cv-foot__jrf"><span>${escapeHtml(author)}</span></div>
  </div>`;

  return `
<section class="cover ${classes}"${styleAttr}>
  ${pattern ? coverPatternSvg(pattern.kind, geo.w, geo.h, pattern.color) : ""}
  <div class="cv-shade" aria-hidden="true"></div>
  ${emblem}
  <header class="cv-top">
    ${lockup}
    <div class="cv-top__meta">
      ${langLabel}
      ${editionBadge}
      ${session ? `<span class="cv-session">${escapeHtml(session)}</span>` : ""}
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
  ${footer}
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
      <a href="#${t.id}"><span class="toc__text">${escapeHtml(t.text)}</span><span class="toc__dots"></span></a>
    </li>`,
      )
      .join("\n")}
  </ol>
</nav>`;
}

/* ── Page chrome (running header/footer sources) ───────────────────── */

function runnersHtml(doc: Doc, brand: BrandConfig): string {
  // Universal keeps the useful chrome (title · topic · page number) but
  // drops every branded element from the footer.
  if (TEMPLATE_META[doc.template].plainChrome) {
    return `
<div class="run-head-book">${escapeHtml(doc.exam || doc.title || "")}</div>
<div class="run-head-topic"></div>
<div class="run-foot-brand"></div>
<div class="run-foot-site">${doc.author ? `<span>${escapeHtml(doc.author)}</span>` : ""}</div>
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
/* NOTE: Paged.js is a print polyfill — it applies @media print rules to
   the paginated screen document too, so an !important zoom reset here
   would permanently disable the preview's zoom controls. The harness
   resets zoom imperatively around window.print() instead. */
@media print {
  body.purpose-preview { background: none; }
  body.purpose-preview .pagedjs_pages { gap: 0; padding: 0; }
  body.purpose-preview .pagedjs_page { box-shadow: none; }
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

export function buildDocumentHtml(doc: Doc, brand: BrandConfig, options: BuildOptions): string {
  const { mode, purpose = "preview", theme = "light" } = options;
  doc = { ...doc, body: stripFrontMatter(doc.body) };
  const template = TEMPLATE_RENDERERS[doc.template];
  const body = template.buildBody(doc);
  const geometry = PAGE_GEOMETRY[doc.layout.pageSize];
  const density = DENSITY[doc.layout.density];
  const paged = mode === "paged";

  const css = `
:root { ${themeVars(brand, theme)}
  --body-size: ${density.size};
  --body-leading: ${density.leading};
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
<html lang="${doc.lang === "hi" ? "hi" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>${css}</style>
${watermarkTemplate}
</head>
<body class="tpl-${doc.template} mode-${mode} purpose-${purpose} density-${doc.layout.density}${theme === "dark" ? " doc-dark" : ""}" data-watermark="${doc.layout.watermark ? "1" : "0"}" data-purpose="${purpose}">
${paged ? content : `<div id="doc-root">${content}</div>`}
${scripts}
</body>
</html>`;
}
