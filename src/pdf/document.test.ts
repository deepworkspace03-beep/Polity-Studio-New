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
    edition: "",
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

    // MCQ template never has a TOC, regardless of the layout flag.
    const mcq = buildDocumentHtml(baseDoc({ template: "mcq", body: "Q. Test?\nA) a\nB) b *" }), DEFAULT_BRAND, { mode: "flow" });
    expect(mcq).not.toContain('class="toc"');
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

  function customCoverDoc(design: Partial<Doc["layout"]["coverDesign"] & object>): Doc {
    return baseDoc({
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
          titleScale: 1,
          align: "left",
          frame: false,
          emblem: true,
          ...design,
        },
      },
    });
  }

  it("derives the frame class from the legacy `frame` boolean when frameStyle is absent", () => {
    const html = buildDocumentHtml(customCoverDoc({ frame: true }), DEFAULT_BRAND, { mode: "flow" });
    expect(html).toContain("cover--frame-single");
  });

  it("emits frameStyle and titleBox classes, sanitizing junk values", () => {
    const styled = buildDocumentHtml(
      customCoverDoc({ frameStyle: "double", titleBox: "premium" }),
      DEFAULT_BRAND,
      { mode: "flow" },
    );
    expect(styled).toContain("cover--frame-double");
    expect(styled).toContain("cover--tbox-premium");

    const junk = buildDocumentHtml(
      customCoverDoc({
        frameStyle: 'evil" onload="x' as never,
        titleBox: "nope" as never,
      }),
      DEFAULT_BRAND,
      { mode: "flow" },
    );
    expect(junk).not.toContain("evil");
    expect(junk).not.toContain("cover--tbox-nope");
  });

  it("renders the new cover patterns as inline SVG", () => {
    for (const pattern of ["waves", "mesh", "geometry"] as const) {
      const html = buildDocumentHtml(customCoverDoc({ pattern }), DEFAULT_BRAND, { mode: "flow" });
      expect(html).toContain('class="cv-pattern"');
    }
  });

  it("wraps the title block in a cv-titlebox for every cover", () => {
    const html = buildDocumentHtml(baseDoc(), DEFAULT_BRAND, { mode: "flow" });
    expect(html).toContain('class="cv-titlebox"');
  });

  it("renders the edition corner badge and the session pill", () => {
    const html = buildDocumentHtml(baseDoc({ edition: "2e", session: "June 2026" }), DEFAULT_BRAND, { mode: "flow" });
    expect(html).toContain('class="cv-edition">2e<'); // extreme top-right corner badge
    expect(html).toContain('class="cv-session">June 2026<'); // top-right meta pill
    // No edition set → no badge at all (no year fallback).
    const noBadge = buildDocumentHtml(baseDoc({ edition: "" }), DEFAULT_BRAND, { mode: "flow" });
    expect(noBadge).not.toContain('class="cv-edition"');
    // No session set → no session pill.
    const noSession = buildDocumentHtml(baseDoc({ session: "" }), DEFAULT_BRAND, { mode: "flow" });
    expect(noSession).not.toContain('class="cv-session"');
  });

  it("shows the language badge per the four cover-only states", () => {
    const en = buildDocumentHtml(baseDoc({ lang: "en" }), DEFAULT_BRAND, { mode: "flow" });
    expect(en).toContain(">English<");
    const hi = buildDocumentHtml(baseDoc({ lang: "hi" }), DEFAULT_BRAND, { mode: "flow" });
    expect(hi).toContain("हिन्दी");
    expect(hi).not.toContain(">English<");
    const both = buildDocumentHtml(baseDoc({ lang: "both" }), DEFAULT_BRAND, { mode: "flow" });
    expect(both).toContain(">English<");
    expect(both).toContain("हिन्दी");
    const none = buildDocumentHtml(baseDoc({ lang: "none" }), DEFAULT_BRAND, { mode: "flow" });
    expect(none).not.toContain("cv-lang");
  });
});

describe("buildShellKey", () => {
  it("changes when the template, page size, density, language or theme changes", () => {
    const key = buildShellKey(baseDoc(), DEFAULT_BRAND, "light");
    expect(buildShellKey(baseDoc({ template: "mcq" }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ layout: { ...DEFAULT_LAYOUT, pageSize: "a5" } }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ layout: { ...DEFAULT_LAYOUT, density: "compact" } }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc({ lang: "hi" }), DEFAULT_BRAND, "light")).not.toBe(key);
    expect(buildShellKey(baseDoc(), DEFAULT_BRAND, "dark")).not.toBe(key);
  });

  it("stays stable when only body text changes (so typing never forces a full iframe rebuild)", () => {
    const key = buildShellKey(baseDoc(), DEFAULT_BRAND, "light");
    expect(buildShellKey(baseDoc({ body: "completely different text" }), DEFAULT_BRAND, "light")).toBe(key);
  });
});
