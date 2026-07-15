import { describe, expect, it } from "vitest";
import { toPortableMarkdown } from "./image";

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
