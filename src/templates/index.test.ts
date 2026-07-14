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
    author: "",
    lang: "en",
    layout: { ...DEFAULT_LAYOUT },
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("question-bank body — end mode (back-of-book key)", () => {
  it("includes an answer key when answers mode is not none", () => {
    const doc = baseDoc({ template: "question-bank", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d", layout: { ...DEFAULT_LAYOUT, answers: "end" } });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).toContain('id="answer-key"');
  });

  it("omits the answer key entirely when answers mode is none", () => {
    const doc = baseDoc({ template: "question-bank", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d", layout: { ...DEFAULT_LAYOUT, answers: "none" } });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).not.toContain('id="answer-key"');
  });

  it("does not mark the correct option or show a checkmark outside inline mode", () => {
    const doc = baseDoc({ template: "question-bank", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d", layout: { ...DEFAULT_LAYOUT, answers: "end" } });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).not.toContain("q__opt--correct");
    expect(html).not.toContain("q__check");
  });
});

describe("question-bank body — inline mode (answer revealed under each question)", () => {
  it("marks the correct option with a checkmark instead of a separate answer line", () => {
    const doc = baseDoc({
      template: "question-bank",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d\nExplanation: Because.",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).toContain('class="q__opt q__opt--correct"');
    expect(html).toContain('class="q__check"');
    expect(html).not.toContain("q__answer-label");
  });

  it("shows the worked solution inline when an explanation is present", () => {
    const doc = baseDoc({
      template: "question-bank",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d\nSource: UGC-NET Dec 2023\nSolution: Because reasons.",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).toContain("pyq__sol");
    expect(html).toContain("Because reasons");
  });

  it("shows the correct option even with no explanation text", () => {
    const doc = baseDoc({
      template: "question-bank",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).toContain('class="q__opt q__opt--correct"');
  });
});

describe("question-bank body — Source badge (PYQ-style headline)", () => {
  it("renders a source as the headline exam badge, right-aligned after the chips", () => {
    const doc = baseDoc({
      template: "question-bank",
      body: "## Unit 4 — Comparative Politics\n\nQ. Test?\nA) a\nB) b *\nC) c\nD) d\nSource: UGC-NET Dec 2023",
    });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).toContain('class="pyq__exam"');
    expect(html).toContain("UGC-NET Dec 2023");
    // Header order: number, then chips (Unit/Topic/Marks), then the
    // source badge last in markup (CSS pushes it to the row's right edge).
    const head = html.slice(html.indexOf('class="q__head"'), html.indexOf("</div>", html.indexOf('class="q__head"')));
    expect(head.indexOf("q__num")).toBeLessThan(head.indexOf("q__chips"));
    expect(head.indexOf("q__chips")).toBeLessThan(html.indexOf('class="pyq__exam"'));
    expect(html).toContain("Comparative Politics"); // Unit chip from the section title
  });

  it("has no source badge and plain chips when the question has no Source", () => {
    const doc = baseDoc({ template: "question-bank", body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d" });
    const { html } = TEMPLATE_RENDERERS["question-bank"].buildBody(doc);
    expect(html).not.toContain('class="pyq__exam"');
  });
});

describe("revision body", () => {
  it("renders as plain prose by default (revisionStyle: notes)", () => {
    const doc = baseDoc({ template: "revision", body: "# Title\n\nSome bullet points.", layout: { ...DEFAULT_LAYOUT, revisionStyle: "notes" } });
    const { html } = TEMPLATE_RENDERERS.revision.buildBody(doc);
    expect(html).toContain('class="doc"');
    expect(html).not.toContain('class="deck"');
  });

  it("splits ## fronts into flashcards when revisionStyle is cards", () => {
    const doc = baseDoc({
      template: "revision",
      body: "## Term A\nDefinition A\n\n## Term B\nDefinition B",
      layout: { ...DEFAULT_LAYOUT, revisionStyle: "cards" },
    });
    const { html, coverLines } = TEMPLATE_RENDERERS.revision.buildBody(doc);
    expect(html).toContain("Term A");
    expect(html).toContain("Definition B");
    expect(coverLines[0]).toContain("2 Active-Recall Card");
  });
});

describe("universal body", () => {
  it("renders plain prose with no template-specific cover lines", () => {
    const doc = baseDoc({ template: "universal", body: "# Title\n\nBody text." });
    const { html, coverLines } = TEMPLATE_RENDERERS.universal.buildBody(doc);
    expect(html).toContain('class="doc"');
    expect(coverLines).toEqual([]);
  });
});
