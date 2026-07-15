import { describe, expect, it } from "vitest";
import { TEMPLATE_RENDERERS } from "./index";
import { DEFAULT_LAYOUT } from "../brand/defaults";
import type { Doc } from "../lib/types";

function baseDoc(partial: Partial<Doc>): Doc {
  return {
    id: "d",
    title: "T",
    subtitle: "",
    template: "notes",
    body: "",
    exam: "",
    paper: "",
    session: "",
    edition: "",
    author: "",
    lang: "en",
    layout: { ...DEFAULT_LAYOUT },
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("mcqBody", () => {
  it("includes an answer key when answers mode is not none", () => {
    const doc = baseDoc({ template: "mcq", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d", layout: { ...DEFAULT_LAYOUT, answers: "end" } });
    const { html } = TEMPLATE_RENDERERS.mcq.buildBody(doc);
    expect(html).toContain('id="answer-key"');
  });

  it("omits the answer key entirely when answers mode is none", () => {
    const doc = baseDoc({ template: "mcq", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d", layout: { ...DEFAULT_LAYOUT, answers: "none" } });
    const { html } = TEMPLATE_RENDERERS.mcq.buildBody(doc);
    expect(html).not.toContain('id="answer-key"');
  });

  it("shows the answer inline under each question when answers mode is inline", () => {
    const doc = baseDoc({
      template: "mcq",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d\nExplanation: Because.",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS.mcq.buildBody(doc);
    expect(html).toContain('class="q__answer"');
  });
});

describe("pyqBody", () => {
  it("always shows the solution inline (no answers toggle)", () => {
    const doc = baseDoc({
      template: "pyq",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d\nAnswer: B\nSolution: Because reasons.",
    });
    const { html } = TEMPLATE_RENDERERS.pyq.buildBody(doc);
    expect(html).toContain("pyq__sol");
    expect(html).toContain("Because reasons");
  });
});

describe("flashcardsBody", () => {
  it("splits ## fronts into cards with their body as the back", () => {
    const doc = baseDoc({ template: "flashcards", body: "## Term A\nDefinition A\n\n## Term B\nDefinition B" });
    const { html, coverLines } = TEMPLATE_RENDERERS.flashcards.buildBody(doc);
    expect(html).toContain("Term A");
    expect(html).toContain("Definition B");
    expect(coverLines[0]).toContain("2 Active-Recall Card");
  });
});
