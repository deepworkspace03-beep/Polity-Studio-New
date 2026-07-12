import { describe, expect, it } from "vitest";
import { normalizeMarkdown, reviewHeadline, reviewMarkdown } from "./markdownReview";

describe("reviewMarkdown", () => {
  it("counts words, headings, tables, images and links, excluding fenced code", () => {
    const src = [
      "# Title",
      "",
      "Some words here for counting purposes.",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "![alt](pic.png)",
      "[link](https://example.com)",
      "",
      "```js",
      "this code should not count as words or headings",
      "# not a heading either",
      "```",
    ].join("\n");
    const r = reviewMarkdown(src);
    expect(r.headings).toBe(1);
    expect(r.tables).toBe(1);
    expect(r.images).toBe(1);
    expect(r.links).toBe(1);
    expect(r.codeBlocks).toBe(1);
    expect(r.words).toBeLessThan(20); // fenced code excluded
  });

  it("warns about more than one top-level heading", () => {
    const r = reviewMarkdown("# One\n\nbody\n\n# Two\n\nbody");
    expect(r.warnings.some((w) => w.includes("top-level"))).toBe(true);
  });

  it("warns when a heading level skips (H1 -> H3)", () => {
    const r = reviewMarkdown("# One\n\n### Three");
    expect(r.warnings.some((w) => w.includes("skipped a level"))).toBe(true);
  });

  it("warns about an unclosed code fence", () => {
    const r = reviewMarkdown("```js\nconst x = 1;");
    expect(r.warnings.some((w) => w.includes("never closed"))).toBe(true);
  });

  it("warns about a ragged table", () => {
    const r = reviewMarkdown("| A | B | C |\n|---|---|---|\n| 1 | 2 |");
    expect(r.warnings.some((w) => w.includes("uneven column"))).toBe(true);
  });

  it("reports fixable count matching what normalizeMarkdown would change", () => {
    const src = "##Bad spacing\ntext";
    const r = reviewMarkdown(src);
    expect(r.fixable).toBeGreaterThan(0);
  });
});

describe("normalizeMarkdown", () => {
  it("fixes missing space after heading markers", () => {
    const { markdown } = normalizeMarkdown("##Heading\ntext");
    expect(markdown).toContain("## Heading");
  });

  it("adds breathing room before a heading that follows text directly", () => {
    const { markdown } = normalizeMarkdown("text\n## Heading");
    const lines = markdown.split("\n");
    const idx = lines.indexOf("## Heading");
    expect(lines[idx - 1]).toBe("");
  });

  it("collapses runs of blank lines to one", () => {
    const { markdown } = normalizeMarkdown("a\n\n\n\nb");
    expect(markdown).toBe("a\n\nb");
  });

  it("converts a two-space hard break into the app's backslash dialect", () => {
    const { markdown } = normalizeMarkdown("line one  \nline two");
    expect(markdown).toBe("line one\\\nline two");
  });

  it("leaves fenced code blocks byte-for-byte untouched", () => {
    const src = "```\n##not a heading\n\n\n\nextra blanks kept\n```";
    const { markdown } = normalizeMarkdown(src);
    expect(markdown).toBe(src);
  });

  it("strips zero-width and NBSP characters", () => {
    const { markdown } = normalizeMarkdown("a​b c");
    expect(markdown).toBe("ab c");
  });
});

describe("reviewHeadline", () => {
  it("prioritizes warnings over fixes", () => {
    const headline = reviewHeadline({
      words: 0,
      headings: 0,
      tables: 0,
      images: 0,
      links: 0,
      codeBlocks: 0,
      readingMinutes: 1,
      pages: 1,
      fixable: 3,
      warnings: ["one issue"],
    });
    expect(headline).toContain("thing");
  });

  it("reports a clean document when nothing needs attention", () => {
    const headline = reviewHeadline({
      words: 10,
      headings: 0,
      tables: 0,
      images: 0,
      links: 0,
      codeBlocks: 0,
      readingMinutes: 1,
      pages: 1,
      fixable: 0,
      warnings: [],
    });
    expect(headline).toBe("Looks clean");
  });
});
