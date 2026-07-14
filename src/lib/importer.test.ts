import { describe, expect, it } from "vitest";
import { cleanPlainText, htmlToMarkdown, smartFormatDocument, smartPaste } from "./importer";

describe("htmlToMarkdown", () => {
  it("converts headings, bold and lists", () => {
    const { markdown } = htmlToMarkdown("<h2>Title</h2><p><b>Bold</b> and <i>italic</i></p><ul><li>alpha</li><li>beta</li></ul>");
    expect(markdown).toContain("## Title");
    expect(markdown).toContain("**Bold**");
    expect(markdown).toContain("*italic*");
    expect(markdown).toContain("- alpha");
    expect(markdown).toContain("- beta");
  });

  it("does not treat Google Docs' font-weight:normal wrapper as bold", () => {
    const { markdown } = htmlToMarkdown('<b style="font-weight:normal"><p>Not actually bold text.</p></b>');
    expect(markdown).not.toContain("**Not actually bold text.**");
    expect(markdown).toContain("Not actually bold text.");
  });

  it("treats a styled span with font-weight >= 600 as bold", () => {
    const { markdown } = htmlToMarkdown('<p><span style="font-weight:700">Strong span</span></p>');
    expect(markdown).toContain("**Strong span**");
  });

  it("re-materializes Word's mso-list paragraphs as bullets", () => {
    const { markdown } = htmlToMarkdown('<p style="mso-list:l0 level1 lfo1">First item</p><p style="mso-list:l0 level1 lfo1">Second item</p>');
    expect(markdown).toContain("- First item");
    expect(markdown).toContain("- Second item");
  });

  it("converts a table to a Markdown table", () => {
    const { markdown } = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
    expect(markdown).toContain("| A | B |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| 1 | 2 |");
  });

  it("keeps only http(s) links, dropping others as plain text", () => {
    const { markdown } = htmlToMarkdown('<p><a href="https://example.com">Example</a> and <a href="javascript:alert(1)">bad</a></p>');
    expect(markdown).toContain("[Example](https://example.com)");
    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("bad");
  });

  it("keeps http(s) images and drops data: images", () => {
    const withUrl = htmlToMarkdown('<img src="https://example.com/a.png" alt="pic">');
    expect(withUrl.markdown).toContain("![pic](https://example.com/a.png)");
    const withData = htmlToMarkdown('<img src="data:image/png;base64,AAAA" alt="pic">');
    expect(withData.markdown).not.toContain("data:image");
  });
});

describe("cleanPlainText", () => {
  it("converts unicode bullets to Markdown list markers", () => {
    const { markdown, fixes } = cleanPlainText("• first\n• second");
    expect(markdown).toContain("- first");
    expect(markdown).toContain("- second");
    expect(fixes).toBeGreaterThan(0);
  });

  it("strips zero-width junk and normalizes NBSP", () => {
    const { markdown } = cleanPlainText("a​b c");
    expect(markdown).toBe("ab c");
  });

  it("collapses runs of 3+ blank lines to a single blank line", () => {
    const { markdown } = cleanPlainText("a\n\n\n\n\nb");
    expect(markdown).toBe("a\n\nb");
  });

  it("leaves already-clean Markdown/MCQ text untouched (no fixes)", () => {
    const src = "Q1. What is federalism?\na) One\nb) Two\n\n## Section";
    const { markdown, fixes } = cleanPlainText(src);
    expect(fixes).toBe(0);
    expect(markdown).toBe(src);
  });
});

describe("smartPaste", () => {
  it("returns converted Markdown for rich HTML that adds real structure", () => {
    const result = smartPaste("<h2>Heading</h2><p>Body text.</p>", "Heading\nBody text.");
    expect(result?.markdown).toContain("## Heading");
  });

  it("returns null when HTML converts to exactly the plain text (no value added)", () => {
    const result = smartPaste("<p>Just a plain paragraph</p>", "Just a plain paragraph");
    expect(result).toBeNull();
  });

  it("routes a raw exam paper through the question-bank normalizer", () => {
    // Bracket-numbered questions ("[n/total]") are outside mcq.ts's own
    // grammar (it only recognizes a literal "Q" prefix), so this is
    // genuinely unstructured input from the app's point of view — unlike
    // "Q1./(1)/Answer:", which mcq.ts already parses natively and which
    // smartPaste correctly leaves untouched (see the "already clean"
    // test below).
    const raw = [
      "[1/23] Who wrote the Constitution?",
      "(1) A",
      "(2) B",
      "(3) C",
      "(4) D",
      "Answer: (1)",
      "[2/23] Second question?",
      "(1) A",
      "(2) B",
      "(3) C",
      "(4) D",
      "Answer: (2)",
    ].join("\n");
    const result = smartPaste("", raw);
    expect(result?.summary).toContain("question");
    expect(result?.markdown).toContain("Q. Who wrote the Constitution?");
  });

  it("leaves an already-clean MCQ booklet untouched (returns null)", () => {
    const clean = ["Q. Test?", "A) one", "B) two", "C) three", "D) four", "Answer: B"].join("\n");
    expect(smartPaste("", clean)).toBeNull();
  });

  it("returns null for plain text needing no fixes", () => {
    expect(smartPaste("", "Just ordinary prose with nothing to fix.")).toBeNull();
  });
});

describe("smartFormatDocument", () => {
  it("restructures a raw exam paper already in the editor", () => {
    // Bracket-numbered questions are outside mcq.ts's own grammar (see the
    // routing test above), so this is genuinely unstructured input.
    const raw = ["[1/2] Who wrote the Constitution?", "(1) A", "(2) B", "(3) C", "(4) D", "Answer: (1)", "[2/2] Second?", "(1) A", "(2) B", "(3) C", "(4) D", "Answer: (2)"].join("\n");
    const result = smartFormatDocument(raw);
    expect(result?.markdown).toContain("Q. Who wrote the Constitution?");
    expect(result?.summary).toContain("question");
  });

  it("fixes missing space after a heading marker and adds breathing room", () => {
    const raw = "Some text.\n##Heading\nMore text.";
    const result = smartFormatDocument(raw);
    expect(result?.markdown).toContain("## Heading");
    expect(result?.summary).toContain("heading");
  });

  it("returns null for an already-clean document (nothing to change)", () => {
    expect(smartFormatDocument("# Title\n\nOrdinary clean prose with nothing to fix.")).toBeNull();
  });

  it("returns null for an empty document", () => {
    expect(smartFormatDocument("   ")).toBeNull();
  });

  it("never discards content — every non-whitespace character survives (only spacing/order changes)", () => {
    const raw = "##Sloppy Heading\nSome text here.\n\n\n\nToo many blank lines above.";
    const result = smartFormatDocument(raw);
    expect(result).not.toBeNull();
    const chars = (s: string) => [...s.replace(/\s+/g, "")].sort().join("");
    expect(chars(result!.markdown)).toEqual(chars(raw));
  });
});
