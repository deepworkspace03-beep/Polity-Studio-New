import { describe, expect, it } from "vitest";
import { toPortableMarkdown } from "./image";
import { cleanPlainText } from "./importer";

describe("toPortableMarkdown", () => {
  it("strips Studio figure attributes so the image is standard Markdown", () => {
    const body = "Intro\n\n![Map](data:image/png;base64,AAAA){width=60% align=left round}\n\nMore";
    expect(toPortableMarkdown(body)).toBe("Intro\n\n![Map](data:image/png;base64,AAAA)\n\nMore");
  });

  it("preserves the image title/caption while dropping the attribute block", () => {
    const body = '![alt](pic.png "A caption"){align=right width=35%}';
    expect(toPortableMarkdown(body)).toBe('![alt](pic.png "A caption")');
  });

  it("leaves plain images and non-image braces untouched", () => {
    const body = "![plain](pic.png)\n\nText with {curly} braces and code `{x}`.";
    expect(toPortableMarkdown(body)).toBe(body);
  });
});

describe("image markdown round-trip", () => {
  // A realistic embedded image: base64 carries +, / and = — the exact
  // characters a naive text tidy might mangle. The .md import path runs
  // the body through cleanPlainText, so it must survive byte-for-byte.
  const DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg+/AABmJLR0QA/w==";

  it("preserves an embedded data-URI image through the .md import tidy", () => {
    const body = `# Notes\n\n![Diagram](${DATA_URI}){width=45% align=center}\n\nBody text.`;
    expect(cleanPlainText(body).markdown).toBe(body);
  });

  it("keeps the full image after stripping attributes for portable export", () => {
    const body = `![Diagram](${DATA_URI}){width=45% align=center round}`;
    const portable = toPortableMarkdown(body);
    expect(portable).toBe(`![Diagram](${DATA_URI})`);
    // The image bytes themselves survive intact — nothing truncated.
    expect(portable).toContain(DATA_URI);
  });
});
