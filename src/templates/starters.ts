import type { TemplateId } from "../lib/types";

/** Starter content for new documents — enough to demonstrate the
    supported syntax for each template. */
export const STARTERS: Record<TemplateId, { title: string; body: string }> = {
  notes: {
    title: "Untitled Notes",
    body: `# Introduction to Political Theory

Political theory examines the foundations of political life, including authority, justice, rights, and obligations.

## Classical Political Philosophy

### Plato's Republic

Plato argued that the ideal state should be ruled by philosopher-kings — those with knowledge of the Good.

::: definition Philosopher-King
A ruler who combines political power with philosophical knowledge of the Good.
:::

### Aristotle's Politics

Aristotle defined man as a *political animal* (zoon politikon), arguing that humans naturally form communities.

| Aristotle's Six Constitutions | Ideal Form | Corrupt Form |
|-------------------------------|------------|--------------|
| Rule by One | Monarchy | Tyranny |
| Rule by Few | Aristocracy | Oligarchy |
| Rule by Many | Polity | Democracy |

## Key Terms

- **Political Authority** — the legitimate right to govern
- **Social Contract** — an agreement forming the basis of society
- **Natural Rights** — rights that exist independently of law

::: exam
Political theory questions frequently test Plato, Aristotle, Hobbes, Locke and Rousseau — study the social contract theorists in depth.
:::

## Formatting Cheatsheet

**bold** · *italic* · ==highlight== · ++underline++ · ~~struck~~ · x^2^ · H~2~O — and \`\\pagebreak\` on its own line starts a new PDF page. Open Library → Examples for a full showcase.
`,
  },

  "question-bank": {
    title: "Untitled Question Bank",
    body: `Attempt all questions. Each carries 2 marks. There is no negative marking. Add \`Source:\`, \`Exam:\` or \`Year:\` to stamp the source badge — questions with a Source read as previous-year questions; without one, as plain practice MCQs.

## Section A — Political Theory

Q. Who described political science as "the master science"?
A) Plato
B) Aristotle *
C) Machiavelli
D) Harold Laski
Explanation: Aristotle called politics the master science because it determines what other sciences should be studied within the state.
Topic: Greek Political Thought
Source: UGC-NET Dec 2023

Q. The concept of "Judicial Review" in the Indian Constitution is borrowed from —
A) United Kingdom
B) United States *
C) Ireland
D) Canada
Answer: B
Source: UPSC CSE 2021
Solution: Judicial review — the power of courts to test laws against the Constitution — is drawn from the **United States**. India adopts a moderated form: unlike the American "due process", Indian courts review under "procedure established by law" (Article 21).
`,
  },

  revision: {
    title: "Untitled Revision",
    body: `# Unit at a Glance

**One-line thesis:** put the single most examinable idea of this unit here.

## Core Concepts

- **Concept 1** — one-line definition with the *key phrase* examiners expect
- **Concept 2** — one-line definition
- **Concept 3** — one-line definition

## Thinkers & Attributions

| Thinker | Work | One-liner |
|---|---|---|
| Name | Title | The phrase to remember |

::: exam
Asked in Dec 2023, June 2024. The examiner favours exact attributions here.
:::

## Rapid-Fire Points

1. Point one
2. Point two
3. Point three

*Prefer a cut-out flashcard deck instead? Switch "Layout" to Flashcards in the settings pane — each "##" heading becomes a card front, and the text below it the back.*
`,
  },

  universal: {
    title: "Untitled Document",
    body: `# Document Title

A brand-neutral starting point for any Markdown document — a report, a manual, a proposal, personal writing. No fixed institute name, watermark or social links; the cover shows only what you fill in.

## Section One

Write your content using the same Markdown as every other template: **bold**, *italic*, tables, lists, callouts, footnotes and page breaks all work here.

::: note
Callout boxes (definition, example, important, summary, tip, warning, note, exam) are available if useful, or skip them entirely for plain prose.
:::

## Section Two

- Point one
- Point two
- Point three

Open Settings → Details to add an author name, an optional cover, and a table of contents — everything here is opt-in.
`,
  },
};
