import { describe, expect, it } from "vitest";
import { extractToc, renderMarkdown, slugify } from "./renderer";

describe("slugify", () => {
  it("lowercases, strips punctuation and hyphenates spaces", () => {
    expect(slugify("Aristotle's Six Constitutions!")).toBe("aristotles-six-constitutions");
  });

  it("prefixes a leading-digit slug so it stays a valid CSS identifier", () => {
    // A bare "1.1 doctrine" slug would start with a digit, which
    // querySelector (used by Paged.js for TOC targets) rejects.
    expect(slugify("1.1 Doctrine")).toMatch(/^s-/);
  });
});

describe("extractToc", () => {
  it("collects h1-h3 headings with levels and ids", () => {
    const toc = extractToc("# Chapter One\n\n## Section A\n\n### Sub A.1\n\n#### Too deep");
    expect(toc.map((t) => t.level)).toEqual([1, 2, 3]);
    expect(toc[0].id).toBe("chapter-one");
  });

  it("dedupes identical heading text with a numeric suffix", () => {
    const toc = extractToc("## Repeat\n\nbody\n\n## Repeat");
    expect(toc[0].id).toBe("repeat");
    expect(toc[1].id).toBe("repeat-1");
  });
});

describe("shared parse memo", () => {
  // renderMarkdown and extractToc share a single parse of the same body
  // (a build renders the body and extracts the TOC from it). These lock
  // the reuse to byte-identical, side-effect-free output.
  it("renders identically when the same body is rendered twice", () => {
    const body = "# Title\n\nA line with a footnote.[^a]\n\n## Section\n\nSee Question 3.\n\n[^a]: The note.";
    expect(renderMarkdown(body)).toBe(renderMarkdown(body));
  });

  it("keeps TOC ids in sync with the anchor ids the body render emits", () => {
    const body = "# Alpha Beta\n\ntext\n\n## Gamma Delta\n\nmore";
    const html = renderMarkdown(body);
    for (const t of extractToc(body)) {
      expect(html).toContain(`id="${t.id}"`);
    }
  });

  it("renders footnotes correctly after a TOC extraction reused the parse", () => {
    const body = "# H\n\nClaim.[^x]\n\n[^x]: Evidence.";
    extractToc(body); // primes the memo
    const html = renderMarkdown(body);
    expect(html).toContain("footnote");
    expect(html).toContain("Evidence.");
  });
});

describe("renderMarkdown", () => {
  it("renders a callout container with its type class and label", () => {
    const html = renderMarkdown("::: definition Sovereignty\nSupreme authority.\n:::");
    expect(html).toContain('class="callout callout--definition"');
    expect(html).toContain("Sovereignty");
  });

  it("renders mark/sub/sup/ins extensions", () => {
    const html = renderMarkdown("==highlight== H~2~O x^2^ ++underline++");
    expect(html).toContain("<mark>highlight</mark>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
    expect(html).toContain("<ins>underline</ins>");
  });

  it("turns \\pagebreak on its own line into a page-break div", () => {
    const html = renderMarkdown("Before\n\n\\pagebreak\n\nAfter");
    expect(html).toContain('class="page-break"');
  });

  it("wraps a standalone image paragraph in a figure with caption/width/align", () => {
    const html = renderMarkdown('![alt text](pic.png "A caption"){width=60% align=left}');
    expect(html).toContain("md-figure--left");
    expect(html).toContain("--fig-w:60%");
    expect(html).toContain("<figcaption>A caption</figcaption>");
  });

  it("splits a leading image line off its paragraph into a figure (textbook wrap)", () => {
    const html = renderMarkdown("![p](pic.png){align=left width=20%}\nIntro text wraps beside the portrait.");
    expect(html).toContain("md-figure--left");
    expect(html).toContain("--fig-w:20%");
    expect(html).toContain("Intro text wraps beside the portrait.");
    expect(html).not.toContain("{align=left");
  });

  it("splits a bare image line followed by text into a centered figure", () => {
    const html = renderMarkdown("![p](pic.png)\nBody text on the next line.");
    expect(html).toContain("md-figure--center");
    expect(html).toContain("Body text on the next line.");
  });

  it("keeps an image inline when text follows on the same line", () => {
    const html = renderMarkdown("![icon](i.png) label text");
    expect(html).not.toContain("md-figure");
    expect(html).toContain("<img");
  });

  it("applies the new figure layout/style options as classes", () => {
    const html = renderMarkdown("![x](pic.png){align=full border round shadow gap=lg}");
    expect(html).toContain("md-figure--full");
    expect(html).toContain("md-fig--border");
    expect(html).toContain("md-fig--round");
    expect(html).toContain("md-fig--shadow");
    expect(html).toContain("md-fig--gap-lg");
  });

  it("adds data-line to block-level elements for editor/preview cursor sync", () => {
    const html = renderMarkdown("First paragraph.");
    expect(html).toContain('data-line="1"');
  });

  it("opens external links in a new tab with rel=noopener", () => {
    const html = renderMarkdown("[link](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });

  it("converts ASCII arrow shortcuts to Unicode glyphs in prose", () => {
    const html = renderMarkdown("cause -> effect, back <- here, both <-> ways, implies => result");
    expect(html).toContain("cause → effect");
    expect(html).toContain("back ← here");
    expect(html).toContain("both ↔ ways");
    expect(html).toContain("implies ⇒ result");
  });

  it("leaves arrow-like sequences inside inline code untouched", () => {
    const html = renderMarkdown("`a -> b` and text -> here");
    expect(html).toContain("<code>a -&gt; b</code>");
    expect(html).toContain("text → here");
  });

  it("never turns (R)/(C)/(TM) into symbols — exam labels must print literally", () => {
    // The stock typographer converted "Reason (R)" to "Reason ®" — fatal
    // for Assertion–Reason banks and lettered references in any template.
    const html = renderMarkdown("labelled Assertion (A) and Reason (R), option (C), mark (TM).");
    expect(html).toContain("Reason (R)");
    expect(html).toContain("option (C)");
    expect(html).toContain("mark (TM)");
    expect(html).not.toContain("®");
    expect(html).not.toContain("™");
  });

  it("keeps the useful typography: en/em dashes, ellipsis and ±", () => {
    const html = renderMarkdown("range 10--20 --- wait... give +-5");
    expect(html).toContain("10–20");
    expect(html).toContain("—");
    expect(html).toContain("wait…");
    expect(html).toContain("±5");
  });
});

describe("cross-references & anchor targets", () => {
  it("turns Question/Q/Table/Figure/Diagram/Note references into internal xref links", () => {
    const html = renderMarkdown("See Question 42 and Q7, then Table 3, Figure 2, Diagram 5 and Note 15.");
    expect(html).toContain('<a href="#q-42" class="xref">Question 42</a>');
    expect(html).toContain('<a href="#q-7" class="xref">Q7</a>');
    expect(html).toContain('<a href="#table-3" class="xref">Table 3</a>');
    expect(html).toContain('<a href="#fig-2" class="xref">Figure 2</a>');
    expect(html).toContain('<a href="#fig-5" class="xref">Diagram 5</a>');
    expect(html).toContain('<a href="#fn15" class="xref">Note 15</a>');
  });

  it("never rewrites references inside code, existing links or headings", () => {
    const code = renderMarkdown("`Question 42` stays code");
    expect(code).not.toContain("xref");
    const link = renderMarkdown("[Question 42](https://example.com)");
    expect(link).not.toContain("xref");
    const heading = renderMarkdown("## Question 42 Analysis");
    expect(heading).not.toContain("xref");
  });

  it("leaves plain words without a number untouched", () => {
    const html = renderMarkdown("A good question deserves a note and a table.");
    expect(html).not.toContain("xref");
  });

  it("numbers tables and figures in document order as link targets", () => {
    const html = renderMarkdown("| a |\n|---|\n| b |\n\n![x](p.png)\n\n| c |\n|---|\n| d |");
    expect(html).toContain('id="table-1"');
    expect(html).toContain('id="table-2"');
    expect(html).toContain('id="fig-1"');
  });

  it("skips id assignment for fragment renders (refIds: false) so repeated fragments stay unique", () => {
    const html = renderMarkdown("| a |\n|---|\n| b |\n\n![x](p.png)", { refIds: false });
    expect(html).not.toContain('id="table-1"');
    expect(html).not.toContain('id="fig-1"');
  });
});
