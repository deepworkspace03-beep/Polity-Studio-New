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
    expect(html).not.toContain('class="q__sol"');
  });

  it("end mode wires two-way answer navigation: Answer → jump chips and ↩ Question returns", () => {
    const doc = baseDoc({
      template: "questions",
      body: `${SOLVED_Q}\n\nQ. No solution here?\nA) a *\nB) b`,
      layout: { ...DEFAULT_LAYOUT, answers: "end" },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    // Q1 has a worked solution → its chip targets the explanation entry…
    expect(html).toContain('href="#exp-1"');
    expect(html).toContain('id="exp-1"');
    // …Q2 has none → its chip targets the answer-key cell instead.
    expect(html).toContain('href="#key-2"');
    expect(html).toContain('id="key-2"');
    // The explanation returns to the question, and key numbers link back.
    expect(html).toContain('class="exp__back" href="#q-1"');
    expect(html).toContain('<a class="key__q" href="#q-1">');
  });

  it("inline mode carries no Answer → chips (the answer is already on the card)", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain("q__jump");
  });

  it("none mode reveals nothing at all", () => {
    const doc = baseDoc({ template: "questions", body: SOLVED_Q, layout: { ...DEFAULT_LAYOUT, answers: "none" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain('id="answer-key"');
    expect(html).not.toContain("q__opt--correct");
    expect(html).not.toContain("q__sol");
  });

  it("classifies option layout at build time: 4-across for tiny options, one column for long ones", () => {
    const tiny = baseDoc({
      template: "questions",
      body: "Q. Year of the Government of India Act?\nA) 1909\nB) 1919 *\nC) 1935\nD) 1947",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    expect(TEMPLATE_RENDERERS.questions.buildBody(tiny).html).toContain("q__options--row");

    const long = baseDoc({
      template: "questions",
      body: "Q. Pick?\nA) A deliberately very long option that runs well past the fifty-five character mark\nB) b *\nC) c\nD) d",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    expect(TEMPLATE_RENDERERS.questions.buildBody(long).html).toContain("q__options--long");

    const medium = baseDoc({
      template: "questions",
      body: "Q. Pick?\nA) A medium length option here\nB) Another medium one *\nC) Third medium option\nD) Fourth medium option",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const mediumHtml = TEMPLATE_RENDERERS.questions.buildBody(medium).html;
    expect(mediumHtml).not.toContain("q__options--row");
    expect(mediumHtml).not.toContain("q__options--long");
  });

  it("renders Assertion–Reason stems as independent labeled blocks with lead-in and tail preserved", () => {
    const doc = baseDoc({
      template: "questions",
      body: [
        "Q. Given below are two statements labelled Assertion (A) and Reason (R).",
        "Assertion (A): The Indian Constitution provides for judicial review.",
        "Reason (R): India has a written constitution with a clear separation of powers.",
        "In the light of the above statements, choose the correct answer.",
        "A) Both A and R are true and R explains A *",
        "B) Both A and R are true but R does not explain A",
        "C) A is true but R is false",
        "D) A is false but R is true",
      ].join("\n"),
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain('class="q__st-label">Assertion (A)</span>');
    expect(html).toContain('class="q__st-label">Reason (R)</span>');
    expect(html).toContain("judicial review");
    expect(html).toContain('class="q__st-tail"');
    // The lead-in sentence stays ordinary stem text above the blocks.
    expect(html).toContain("Given below are two statements");
    // The raw "Assertion (A):" prefix must not survive into the block body.
    expect(html).not.toContain("Assertion (A):");
  });

  it("renders Statement I / Statement II pairs as labeled blocks too", () => {
    const doc = baseDoc({
      template: "questions",
      body: "Q. Read the statements.\nStatement I: Parliament is supreme in India.\nStatement II: The Constitution is supreme in India.\nA) Both true\nB) Only II true *\nC) Only I true\nD) Neither",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).toContain('class="q__st-label">Statement (I)</span>');
    expect(html).toContain('class="q__st-label">Statement (II)</span>');
  });

  it("a lone labeled line stays ordinary text (no half-structured stems)", () => {
    const doc = baseDoc({
      template: "questions",
      body: "Q. Consider.\nStatement: A single statement only.\nA) a *\nB) b",
      layout: { ...DEFAULT_LAYOUT, answers: "inline" },
    });
    expect(TEMPLATE_RENDERERS.questions.buildBody(doc).html).not.toContain("q__st-label");
  });

  it("hiding topics drops the header row and folds number + source into the stem", () => {
    const doc = baseDoc({
      template: "questions",
      body: SOLVED_Q,
      layout: { ...DEFAULT_LAYOUT, answers: "inline", qbTopics: false },
    });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain("q__head");
    expect(html).not.toContain("q__topic");
    expect(html).toContain("q--flat");
    expect(html).toContain('<span class="q__num">Q1</span>');
    // Source rides inline inside the stem's final paragraph — above the
    // options, costing no extra row.
    expect(html).toMatch(/UGC-NET Dec 2023[\s\S]*?<\/p>/);
    expect(html.indexOf("UGC-NET")).toBeLessThan(html.indexOf("q__options"));
  });

  it("unit page breaks and the two-column layout are opt-in classes on the bank root", () => {
    const body = "## U1\n\nQ. One?\nA) a *\nB) b\n\n## U2\n\nQ. Two?\nA) a *\nB) b";
    const on = baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    expect(TEMPLATE_RENDERERS.questions.buildBody(on).html).toContain('class="mcq mcq--breaks"');

    const off = baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline", qbUnitBreaks: false } });
    expect(TEMPLATE_RENDERERS.questions.buildBody(off).html).toContain('class="mcq"');
    expect(TEMPLATE_RENDERERS.questions.buildBody(off).html).not.toContain("mcq--breaks");

    const twoCol = baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline", qbColumns: 2 } });
    expect(TEMPLATE_RENDERERS.questions.buildBody(twoCol).html).toContain("mcq--2col");
  });

  it("section headers carry a question-count chip", () => {
    const body = "## Unit 1\n\nQ. One?\nA) a *\nB) b\n\nQ. Two?\nA) a *\nB) b";
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline" } }));
    expect(html).toContain('class="mcq-section__count">2 Qs</span>');
  });

  it("deduplicates identical long solutions into clickable references, with back-links on the original", () => {
    const sol =
      "Solution: This detailed explanation is long enough to be worth de-duplicating across questions, because repeating a full paragraph twice wastes a meaningful amount of page space.";
    const body = `Q. First?\nA) a *\nB) b\n${sol}\n\nQ. Second?\nA) a *\nB) b\n${sol}`;
    const doc = baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    // The second card references the first instead of repeating the text.
    expect(html).toContain('class="q__sol-ref" href="#q-1">See Question 1 for the detailed explanation');
    // The original lists its sharer for the return trip.
    expect(html).toContain('class="q__sol-shared"');
    expect(html).toContain('href="#q-2">Q2</a>');
    // The full text appears exactly once.
    expect((html.match(/worth de-duplicating/g) || []).length).toBe(1);
  });

  it("short identical solutions are repeated, not referenced (a reference line would cost as much)", () => {
    const body = "Q. First?\nA) a *\nB) b\nSolution: Short note.\n\nQ. Second?\nA) a *\nB) b\nSolution: Short note.";
    const doc = baseDoc({ template: "questions", body, layout: { ...DEFAULT_LAYOUT, answers: "inline" } });
    const { html } = TEMPLATE_RENDERERS.questions.buildBody(doc);
    expect(html).not.toContain("q__sol-ref");
    expect((html.match(/Short note\./g) || []).length).toBe(2);
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
