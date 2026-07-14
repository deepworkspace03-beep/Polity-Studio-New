import { describe, expect, it } from "vitest";
import { buildDocumentHtml, buildShellKey } from "./document";
import { DEFAULT_BRAND, DEFAULT_LAYOUT } from "../brand/defaults";
import type { Doc } from "../lib/types";

/**
 * Pure, browser-free regression coverage for the document-assembly layer
 * that feeds the flow preview, the paged preview and the PDF export
 * (see "One builder, three consumers" in ARCHITECTURE.md). This is the
 * layer where most real regressions in the publishing pipeline would
 * actually show up (wrong HTML/CSS assembled from doc+brand+theme) — a
 * browser-driven Playwright suite is a much heavier way to catch the
 * same class of bug and isn't set up in CI; see AI_GUIDE.md for the
 * manual/skill-based browser verification flow instead.
 */

function baseDoc(partial: Partial<Doc> = {}): Doc {
  return {
    id: "doc-1",
    title: "Test Document",
    subtitle: "A subtitle",
    template: "notes",
    body: "# Chapter One\n\nSome body text.\n\n## Section A\n\nMore text.",
    exam: "UGC-NET",
    paper: "",
    session: "2026",
    author: "Author Name",
    lang: "en",
    layout: { ...DEFAULT_LAYOUT },
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("buildDocumentHtml", () => {
  it("includes a cover section when layout.cover is true", () => {
    const html = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow" });
    expect(html).toContain('class="cover cover--regal"');
    expect(html).toContain("Test Document");
  });

  it("omits the cover section when layout.cover is false", () => {
    const doc = baseDoc({ layout: { ...DEFAULT_LAYOUT, cover: false } });
    const html = buildDocumentHtml(doc, DEFAULT_BRAND, { mode: "flow" });
    expect(html).not.toContain('<section class="cover');
  });

  it("includes a table of contents only when the template supports it and layout.toc is on", () => {
    const withToc = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow" });
    expect(withToc).toContain('class="toc"');

    const noToc = buildDocumentHtml(baseDoc({ layout: { ...DEFAULT_LAYOUT, toc: false } }), DEFAULT_BRAND, { mode: "flow" });
    expect(noToc).not.toContain('class="toc"');

    // Question Bank template never has a TOC, regardless of the layout flag.
    const mcq = buildDocumentHtml(baseDoc({ template: "question-bank", body: "Q. Test?\nA) a\nB) b *" }), DEFAULT_BRAND, { mode: "flow" });
    expect(mcq).not.toContain('class="toc"');

    // Flashcard-style Revision has no meaningful TOC (every "##" is a
    // card front, not a section) even though Revision otherwise supports one.
    const cards = buildDocumentHtml(
      baseDoc({ template: "revision", body: "## Front\nBack.", layout: { ...DEFAULT_LAYOUT, revisionStyle: "cards" } }),
      DEFAULT_BRAND,
      { mode: "flow" },
    );
    expect(cards).not.toContain('class="toc"');
  });

  it("sets --font-body from layout.typography", () => {
    const serif = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow" });
    expect(serif).toContain('--font-body: "Literata"');
    const sans = buildDocumentHtml(baseDoc({ layout: { ...DEFAULT_LAYOUT, typography: "sans" } }), DEFAULT_BRAND, { mode: "flow" });
    expect(sans).toContain('--font-body: "Manrope"');
  });

  it("reflects layout.watermark in the data-watermark attribute", () => {
    const on = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "paged" });
    expect(on).toContain('data-watermark="1"');
    const off = buildDocumentHtml(baseDoc({ layout: { ...DEFAULT_LAYOUT, watermark: false } }), DEFAULT_BRAND, { mode: "paged" });
    expect(off).toContain('data-watermark="0"');
  });

  it("produces a different theme-variable block for dark vs light reading theme", () => {
    const light = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow", theme: "light" });
    const dark = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow", theme: "dark" });
    expect(light).toContain("--c-paper: #FFFFFF");
    expect(dark).toContain("--c-paper: #0F141B");
    expect(dark).toContain("doc-dark");
  });

  it("sanitizes an invalid custom-cover color instead of injecting it verbatim", () => {
    const doc = baseDoc({
      layout: {
        ...DEFAULT_LAYOUT,
        coverStyle: "custom",
        coverDesign: {
          bg1: "red; } </style><script>alert(1)</script>",
          bg2: "#1d3357",
          angle: 160,
          ink: "#f5f2ea",
          accent: "#c9bc9e",
          pattern: "grid",
          patternOpacity: 0.05,
          titleFont: "serif",
          titleScale: 1,
          align: "left",
          frame: false,
          emblem: true,
        },
      },
    });
    const html = buildDocumentHtml(doc, DEFAULT_BRAND, { mode: "flow" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("red; }");
  });

  it("clamps an out-of-range custom-cover title scale instead of passing it through", () => {
    const doc = baseDoc({
      layout: {
        ...DEFAULT_LAYOUT,
        coverStyle: "custom",
        coverDesign: {
          bg1: "#0d1930",
          bg2: "#1d3357",
          angle: 160,
          ink: "#f5f2ea",
          accent: "#c9bc9e",
          pattern: "grid",
          patternOpacity: 0.05,
          titleFont: "serif",
          titleScale: 999,
          align: "left",
          frame: false,
          emblem: true,
        },
      },
    });
    const html = buildDocumentHtml(doc, DEFAULT_BRAND, { mode: "flow" });
    expect(html).not.toContain("--cv-title-scale:999");
    expect(html).toContain("--cv-title-scale:1.5"); // clamped to the 0.6–1.5 range
  });
});

describe("buildShellKey", () => {
  it("changes when the template, page size, density, language or theme changes", () => {
    const key = buildShellKey(baseDoc(), DEFAULT_BRAND, "light");
    expect(buildShellKey(baseDoc({ template: "question-bank" }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ layout: { ...DEFAULT_LAYOUT, pageSize: "a5" } }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ layout: { ...DEFAULT_LAYOUT, density: "compact" } }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ layout: { ...DEFAULT_LAYOUT, typography: "sans" } }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ lang: "hi" }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc(), DEFAULT_BRAND, "dark")).not.toBe(key);
  });

  it("stays stable when only body text changes (so typing never forces a full iframe rebuild)", () => {
    const key = buildShellKey(baseDoc(), DEFAULT_BRAND, "light");
    expect(buildShellKey(baseDoc({ body: "completely different text" }), DEFAULT_BRAND, "light")).toBe(key);
  });
});
