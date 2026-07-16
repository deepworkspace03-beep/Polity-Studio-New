import { describe, expect, it } from "vitest";
import { computeWrap } from "./commands";
import { renderMarkdown } from "../../markdown/renderer";

describe("computeWrap — whitespace-aware inline wrapping", () => {
  it("wraps a plain selection flush against the markers", () => {
    const { insert, coreFrom, coreTo } = computeWrap("word", "==", "==", "text");
    expect(insert).toBe("==word==");
    expect(insert.slice(coreFrom, coreTo)).toBe("word");
  });

  it("keeps trailing whitespace outside the markers", () => {
    // The bug this guards: a selection with a trailing space would produce
    // "==word ==", which markdown-it renders as literal text, not a mark.
    const { insert } = computeWrap("word ", "==", "==", "text");
    expect(insert).toBe("==word== ");
  });

  it("keeps leading and trailing whitespace outside the markers", () => {
    const { insert, coreFrom, coreTo } = computeWrap("  two words  ", "**", "**", "text");
    expect(insert).toBe("  **two words**  ");
    expect(insert.slice(coreFrom, coreTo)).toBe("two words");
  });

  it("uses the placeholder for an empty or whitespace-only selection", () => {
    expect(computeWrap("", "==", "==", "text").insert).toBe("==text==");
    expect(computeWrap("   ", "==", "==", "text").insert).toBe("   ==text==");
  });

  it("produces markup markdown-it actually renders as a highlight", () => {
    // Flush markers render as <mark>; a space-touching marker does not —
    // this is exactly why computeWrap trims the surrounding whitespace.
    expect(renderMarkdown(computeWrap("word ", "==", "==", "text").insert)).toContain("<mark>");
    expect(renderMarkdown("==word ==")).not.toContain("<mark>");
  });
});
