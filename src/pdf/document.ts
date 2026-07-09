import type { BrandConfig, Doc, PageSize } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { telegramIconSvg, templeEmblemSvg, templeMarkSvg, watermarkSvg, whatsappIconSvg } from "../brand/marks";
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
}

const PAGE_GEOMETRY: Record<PageSize, { size: string; margin: string }> = {
  a4: { size: "210mm 297mm", margin: "21mm 15mm 23mm 15mm" },
  a5: { size: "148mm 210mm", margin: "16mm 12mm 18mm 12mm" },
  letter: { size: "216mm 279mm", margin: "21mm 16mm 23mm 16mm" },
};

const DENSITY: Record<Doc["layout"]["density"], { size: string; leading: string }> = {
  compact: { size: "11.6pt", leading: "1.52" },
  comfort: { size: "12.6pt", leading: "1.62" },
  relaxed: { size: "13.6pt", leading: "1.72" },
};

function themeVars(brand: BrandConfig): string {
  const c = brand.colors;
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
  --c-good: #177245;`;
}

/* ── Cover ─────────────────────────────────────────────────────────── */

function coverHtml(doc: Doc, brand: BrandConfig, coverLines: string[]): string {
  if (!doc.layout.cover) return "";
  const eyebrowParts = [doc.exam, doc.paper].filter(Boolean);
  const eyebrow = eyebrowParts.length ? `<p class="cv-eyebrow">${escapeHtml(eyebrowParts.join("  ·  "))}</p>` : "";
  const author = doc.author || brand.author;

  return `
<section class="cover cover--${doc.layout.coverStyle}">
  <div class="cv-pattern" aria-hidden="true"></div>
  <div class="cv-shade" aria-hidden="true"></div>
  ${templeEmblemSvg("cv-emblem")}
  <header class="cv-top">
    <div class="cv-pub">
      ${templeMarkSvg("13mm", "cv-mark")}
      <div class="cv-pub__words">
        <b>${escapeHtml(brand.name.toUpperCase())}</b>
        <span>${escapeHtml(brand.initiative)}</span>
      </div>
    </div>
    <span class="cv-edition">${escapeHtml(doc.session || String(new Date().getFullYear()))}</span>
  </header>
  <div class="cv-body">
    ${eyebrow}
    <h1 class="cv-exam">${escapeHtml(doc.title || "Untitled")}</h1>
    ${doc.subtitle ? `<p class="cv-guide">${escapeHtml(doc.subtitle)}</p>` : ""}
    <ul class="cv-highlights">
      ${coverLines.map((h) => `<li>${escapeHtml(h)}</li>`).join("\n      ")}
    </ul>
  </div>
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
      <a href="#${t.id}"><span class="toc__text">${escapeHtml(t.text)}</span><span class="toc__dots"></span></a>
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
@media print {
  body.purpose-preview { background: none; }
  body.purpose-preview .pagedjs_pages { gap: 0; padding: 0; zoom: 1 !important; }
  body.purpose-preview .pagedjs_page { box-shadow: none; }
}`;

/** Cursor-follow highlight used by the flow preview. */
const FLOW_PREVIEW_CSS = `
[data-line].preview-here {
  animation: preview-here 1.6s ease-out;
  border-radius: 4px;
}
@keyframes preview-here {
  0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-accent) 35%, transparent); }
  100% { box-shadow: 0 0 0 4px transparent; }
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
export function buildShellKey(doc: Doc, brand: BrandConfig): string {
  return [
    doc.template,
    doc.layout.pageSize,
    doc.layout.density,
    doc.lang,
    Object.values(brand.colors).join(","),
  ].join("|");
}

export function buildDocumentHtml(doc: Doc, brand: BrandConfig, options: BuildOptions): string {
  const { mode, purpose = "preview" } = options;
  doc = { ...doc, body: stripFrontMatter(doc.body) };
  const template = TEMPLATE_RENDERERS[doc.template];
  const body = template.buildBody(doc);
  const geometry = PAGE_GEOMETRY[doc.layout.pageSize];
  const density = DENSITY[doc.layout.density];
  const paged = mode === "paged";

  const css = `
:root { ${themeVars(brand)}
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
    ? `<template id="watermark-template"><div class="page-watermark" aria-hidden="true">${watermarkSvg(brand.watermarkText)}</div></template>`
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
<body class="tpl-${doc.template} mode-${mode} purpose-${purpose}" data-watermark="${doc.layout.watermark ? "1" : "0"}" data-purpose="${purpose}">
${paged ? content : `<div id="doc-root">${content}</div>`}
${scripts}
</body>
</html>`;
}
