import { describe, expect, it } from "vitest";
import { contentStats, cx, escapeHtml } from "./utils";

describe("cx", () => {
  it("joins truthy class names and skips falsy ones", () => {
    expect(cx("a", false, "b", null, undefined, "c")).toBe("a b c");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">B & "C"</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;B &amp; &quot;C&quot;&lt;/a&gt;");
  });
});

describe("contentStats", () => {
  it("counts unicode-aware words and headings", () => {
    const stats = contentStats("# Title\n\nSome words here, including café.\n\n## Sub");
    expect(stats.headings).toBe(2);
    // Title, Some, words, here, including, café, Sub — heading text counts
    // as body words too (contentStats scans the raw text, unlike the
    // fence-aware reviewMarkdown in markdownReview.ts).
    expect(stats.words).toBe(7);
  });

  it("estimates at least 1 minute of reading time even for a near-empty body", () => {
    expect(contentStats("hi").readingMinutes).toBe(1);
  });
});

describe("estimatePages", () => {
  it("accounts for structure (headings, chapter and manual breaks), cover and TOC", async () => {
    const { estimatePages } = await import("./utils");
    const plain = estimatePages({ words: 4100, headings: 0, h1s: 0, pagebreaks: 0 }, "comfort", false, false);
    expect(plain).toBe(10);
    const structured = estimatePages({ words: 4100, headings: 36, h1s: 5, pagebreaks: 4 }, "comfort", true, true);
    // 10 body pages + 2 heading pages + 2 chapter-break pages + 2 manual-break pages + cover + toc
    expect(structured).toBeGreaterThan(plain + 5);
    expect(estimatePages({ words: 100, headings: 0, h1s: 0, pagebreaks: 0 }, "ultra", false, false)).toBe(1);
  });
});
