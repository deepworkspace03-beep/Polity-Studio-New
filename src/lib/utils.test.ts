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

  it("counts question-dialect markers", () => {
    expect(contentStats("Q. First?\nA) x\nB) y *\n\nQ2. Second?\nA) x\n\nQ) Third?\nNot Q here").questions).toBe(3);
  });

  it("estimates at least 1 minute of reading time even for a near-empty body", () => {
    expect(contentStats("hi").readingMinutes).toBe(1);
  });
});

describe("estimatePages", () => {
  it("accounts for structure (headings, chapter and manual breaks), cover and TOC", async () => {
    const { estimatePages } = await import("./utils");
    const plain = estimatePages({ words: 4100, headings: 0, h1s: 0, pagebreaks: 0, questions: 0 }, "comfort", false, false);
    expect(plain).toBe(10);
    const structured = estimatePages({ words: 4100, headings: 36, h1s: 5, pagebreaks: 4, questions: 0 }, "comfort", true, true);
    // 10 body pages + 2 heading pages + 2 chapter-break pages + 2 manual-break pages + cover + toc
    expect(structured).toBeGreaterThan(plain + 5);
    expect(estimatePages({ words: 100, headings: 0, h1s: 0, pagebreaks: 0, questions: 0 }, "ultra", false, false)).toBe(1);
  });

  it("uses the card-calibrated model for question banks", async () => {
    const { estimatePages } = await import("./utils");
    // Calibration points measured against real Paged.js layouts (A4,
    // compact): 300 questions / 41,197 words → 168 pages incl. cover;
    // 1,500 questions / 142,957 words → 751. The estimate must land
    // within ±10% of the real count — the words-only model was ~50% short.
    const base = { headings: 6, h1s: 0, pagebreaks: 0 };
    const small = estimatePages({ ...base, words: 41197, questions: 300 }, "compact", true, false, "questions");
    expect(small).toBeGreaterThan(168 * 0.9);
    expect(small).toBeLessThan(168 * 1.1);
    const large = estimatePages({ ...base, words: 142957, questions: 1500 }, "compact", true, false, "questions");
    expect(large).toBeGreaterThan(751 * 0.9);
    expect(large).toBeLessThan(751 * 1.1);
    // No question markers → fall back to the prose model.
    expect(estimatePages({ ...base, words: 4100, questions: 0 }, "comfort", false, false, "questions")).toBe(11);
  });
});
