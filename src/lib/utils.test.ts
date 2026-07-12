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
