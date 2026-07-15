import { describe, expect, it } from "vitest";
import { searchInDocument } from "./docSearch";

const BODY = `# Chapter One
Sovereignty is the supreme authority.

## Powers
The separation of powers matters. Powers again.

# Chapter Two
More about sovereignty here.`;

describe("searchInDocument", () => {
  it("returns nothing for a blank query", () => {
    expect(searchInDocument(BODY, "", { estPages: 3 }).matches).toHaveLength(0);
  });

  it("finds all case-insensitive matches with line numbers", () => {
    const r = searchInDocument(BODY, "powers", { estPages: 3 });
    // "Powers" heading, "separation of powers", "Powers again"
    expect(r.total).toBe(3);
    expect(r.matches[0].line).toBe(4); // ## Powers
    expect(r.matches.every((m) => m.hit.toLowerCase() === "powers")).toBe(true);
  });

  it("respects case sensitivity", () => {
    const r = searchInDocument(BODY, "Powers", { estPages: 3, caseSensitive: true });
    expect(r.total).toBe(2); // "Powers" heading + "Powers again" (not "of powers")
  });

  it("respects whole-word matching", () => {
    const r = searchInDocument("supreme superman superb", "super", { estPages: 1, wholeWord: true });
    expect(r.total).toBe(0);
    const r2 = searchInDocument("super superman", "super", { estPages: 1, wholeWord: true });
    expect(r2.total).toBe(1);
  });

  it("groups matches under the nearest preceding heading", () => {
    const r = searchInDocument(BODY, "sovereignty", { estPages: 3 });
    // First hit under Chapter One (pre-"## Powers"), second under Chapter Two.
    const titles = r.matches.map((m) => r.sections[m.section].title);
    expect(titles).toEqual(["Chapter One", "Chapter Two"]);
  });

  it("preserves the original case of the matched text in the snippet", () => {
    const r = searchInDocument(BODY, "chapter", { estPages: 3 });
    expect(r.matches[0].hit).toBe("Chapter");
  });

  it("assigns a section 0 (top of document) to pre-heading matches", () => {
    const r = searchInDocument("intro text here\n# Later", "intro", { estPages: 1 });
    expect(r.matches[0].section).toBe(0);
    expect(r.sections[0].level).toBe(0);
  });
});
