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
  const prose = { headings: 0, h1s: 0, pagebreaks: 0, listItems: 0, callouts: 0, questions: 0 };

  it("accounts for structure (headings, lists, callouts, breaks), cover and TOC", async () => {
    const { estimatePages } = await import("./utils");
    const plain = estimatePages({ ...prose, words: 4100 }, "comfort", false, false);
    expect(plain).toBe(10);
    const structured = estimatePages({ ...prose, words: 4100, headings: 36, h1s: 5, pagebreaks: 4, listItems: 60, callouts: 4 }, "comfort", true, true);
    expect(structured).toBeGreaterThan(plain + 5);
    expect(estimatePages({ ...prose, words: 100 }, "ultra", false, false)).toBe(1);
  });

  it("predicts structured study notes within ±5% of real Paged.js layouts", async () => {
    const { estimatePages } = await import("./utils");
    // Measured layouts (A4 · compact · cover + TOC, scripts/stress.mjs
    // corpora): the words-only model ran ~23% short on this shape of
    // content — the structural costs close the gap.
    const cases = [
      { words: 18967, headings: 165, h1s: 24, listItems: 423, callouts: 24, actual: 79 },
      { words: 47282, headings: 410, h1s: 59, listItems: 1053, callouts: 59, actual: 193 },
      { words: 94536, headings: 819, h1s: 117, listItems: 2106, callouts: 117, actual: 384 },
    ];
    for (const c of cases) {
      const est = estimatePages({ ...c, pagebreaks: 0, questions: 0 }, "compact", true, true);
      expect(est).toBeGreaterThan(c.actual * 0.95);
      expect(est).toBeLessThan(c.actual * 1.05);
    }
  });

  it("uses the card-calibrated model for question banks", async () => {
    const { estimatePages } = await import("./utils");
    // Calibration points measured against real Paged.js layouts (A4,
    // compact): 300 questions / 41,197 words → 154–168 pages incl. cover
    // (browser text shaping varies a few % between engine versions);
    // 1,500 questions / 143k words → ~750. The estimate must land within
    // ±12% of the measured band — the words-only model was ~50% short.
    const base = { headings: 6, h1s: 0, pagebreaks: 0, listItems: 0, callouts: 0 };
    const small = estimatePages({ ...base, words: 41197, questions: 300 }, "compact", true, false, "questions");
    expect(small).toBeGreaterThan(154 * 0.95);
    expect(small).toBeLessThan(168 * 1.12);
    const large = estimatePages({ ...base, words: 142957, questions: 1500 }, "compact", true, false, "questions");
    expect(large).toBeGreaterThan(751 * 0.88);
    expect(large).toBeLessThan(751 * 1.12);
    // No question markers → fall back to the prose model.
    expect(estimatePages({ ...base, words: 4100, questions: 0 }, "comfort", false, false, "questions")).toBe(11);
  });
});
