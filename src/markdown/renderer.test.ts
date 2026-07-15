import { describe, expect, it } from "vitest";
import { extractToc, renderMarkdown, slugify } from "./renderer";

describe("slugify", () => {
  it("lowercases, strips punctuation and hyphenates spaces", () => {
    expect(slugify("Aristotle's Six Constitutions!")).toBe("aristotles-six-constitutions");
  });

  it("prefixes a leading-digit slug so it stays a valid CSS identifier", () => {
    // A bare "1.1 doctrine" slug would start with a digit, which
    // querySelector (used by Paged.js for TOC targets) rejects.
    expect(slugify("1.1 Doctrine")).toMatch(/^s-/);
  });
});

describe("extractToc", () => {
  it("collects h1-h3 headings with levels and ids", () => {
    const toc = extractToc("# Chapter One\n\n## Section A\n\n### Sub A.1\n\n#### Too deep");
    expect(toc.map((t) => t.level)).toEqual([1, 2, 3]);
    expect(toc[0].id).toBe("chapter-one");
  });

  it("dedupes identical heading text with a numeric suffix", () => {
    const toc = extractToc("## Repeat\n\nbody\n\n## Repeat");
    expect(toc[0].id).toBe("repeat");
    expect(toc[1].id).toBe("repeat-1");
  });
});

describe("renderMarkdown", () => {
  it("renders a callout container with its type class and label", () => {
    const html = renderMarkdown("::: definition Sovereignty\nSupreme authority.\n:::");
    expect(html).toContain('class="callout callout--definition"');
    expect(html).toContain("Sovereignty");
  });

  it("renders mark/sub/sup/ins extensions", () => {
    const html = renderMarkdown("==highlight== H~2~O x^2^ ++underline++");
    expect(html).toContain("<mark>highlight</mark>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<ins>underline</ins>");
  });

  it("turns \\pagebreak on its own line into a page-break div", () => {
    const html = renderMarkdown("Before\n\n\\pagebreak\n\nAfter");
    expect(html).toContain('class="page-break"');
  });

  it("wraps a standalone image paragraph in a figure with caption/width/align", () => {
    const html = renderMarkdown('![alt text](pic.png "A caption"){width=60% align=left}');
    expect(html).toContain("md-figure--left");
    expect(html).toContain("--fig-w:60%");
    expect(html).toContain("<figcaption>A caption</figcaption>");
  });

  it("adds data-line to block-level elements for editor/preview cursor sync", () => {
    const html = renderMarkdown("First paragraph.");
    expect(html).toContain('data-line="1"');
  });

  it("opens external links in a new tab with rel=noopener", () => {
    const html = renderMarkdown("[link](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });

  it("converts ASCII arrow shortcuts to Unicode glyphs in prose", () => {
    const html = renderMarkdown("cause -> effect, back <- here, both <-> ways, implies => result");
    expect(html).toContain("cause → effect");
    expect(html).toContain("back ← here");
    expect(html).toContain("both ↔ ways");
    expect(html).toContain("implies ⇒ result");
  });

  it("leaves arrow-like sequences inside inline code untouched", () => {
    const html = renderMarkdown("`a -> b` and text -> here");
    expect(html).toContain("<code>a -&gt; b</code>");
    expect(html).toContain("text → here");
  });
});
