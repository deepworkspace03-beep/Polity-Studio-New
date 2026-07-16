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

const SOLVED_Q = "Q. Test?\nA) a\nB) b *\nC) c\nD) d\nTopic: Greek Thought\nSource: UGC-NET Dec 2023\nSolution: Because reasons.";

describe("questionsBody", () => {
  it("inline mode highlights the correct option with a ✓ and shows the solution under the question", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain("q__opt--correct");
    expect(html).toContain("q__tick");
    expect(html).toContain("q__sol");
    expect(html).toContain("Because reasons");
    // The old separate "Correct Answer" block is gone for good.
    expect(html).not.toContain("q__answer");
    expect(html).not.toContain("Correct Answer");
  });

  it("renders the label-free header row: number, topic, source", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain('<span class="q__num">Q1</span>');
    expect(html).toContain('<span class="q__topic">Greek Thought</span>');
    expect(html).toContain("UGC-NET Dec 2023");
    expect(html).not.toContain("Topic:");
    expect(html).not.toContain("Source:");
  });

  it("reserves no space when a question has no solution", () => {
    const doc = baseDoc({
      template: "questions",
      body: "Q. Test?\nA) a\nB) b *\nC) c\nD) d",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain("q__sol");
  });

  it("anchors every question card with id=q-N for cross-references and PDF links", () => {
    const doc = baseDoc({ template: "questions", body: `${SOLVED_Q}\n\nQ. Second?\nA) a *\nB) b`, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain('id="q-1"');
    expect(html).toContain('id="q-2"');
  });

  it("end mode keeps cards clean and collects the key + explanations at the back", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "end" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain('id="answer-key"');
    expect(html).toContain('id="explanations"');
    expect(html).not.toContain("q__opt--correct");
    expect(html).not.toContain("q__sol");
  });

  it("none mode reveals nothing at all", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "none" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain('id="answer-key"');
    expect(html).not.toContain("q__opt--correct");
    expect(html).not.toContain("q__sol");
  });
});

describe("universalBody", () => {
  it("renders plain Markdown, including migrated flash-card style content", () => {
    const doc = baseDoc({ template: "universal", body: "## Term A\nDefinition A\n\n## Term B\nDefinition B" });
    const { html } = TEMPLATE_RENDERERS.universal.buildBody(doc);
    expect(html).toContain("doc--universal");
    expect(html).toContain("Term A");
    expect(html).toContain("Definition B");
  });
});

describe("AI-generated markdown renders across all four types", () => {
  const AI_BODY = `# Title

Intro with **bold**, ==highlight==, x^2^, a link [site](https://example.com), and see Table 1.

## Section

::: exam Angle
Callout body.
:::

| A | B |
|---|---|
| 1 | 2 |

1. one
2. two

\\pagebreak

> Quote[^1]

[^1]: Footnote.`;

  it.each(["notes", "revision", "universal"] as const)("%s renders full syntax without loss", (tpl) => {
    const doc = baseDoc({ template: tpl, body: AI_BODY });
    const { html } = TEMPLATE_RENDERERS[tpl].buildBody(doc);
    for (const marker of ["<strong>", "<mark>", "<sup>", 'class="callout callout--exam"', "<table", 'class="page-break"', "footnote", 'class="xref"']) {
      expect(html).toContain(marker);
    }
  });

  it("questions renders an AI bank with bolded markers end to end", () => {
    const doc = baseDoc({
      template: "questions",
      body: "## Unit 1\n\n**Q1.** Pick one?\n**A)** First\n**B)** Second\n**Answer:** B\n**Solution:** Because **reasons** hold.\n**Source:** UGC-NET 2025",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain("q__opt--correct");
    expect(html).toContain("UGC-NET 2025");
    expect(html).toContain("<strong>reasons</strong>");
    expect(html).toContain("q__lead");
  });
});
