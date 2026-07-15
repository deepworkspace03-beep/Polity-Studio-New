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

  qbank: {
    title: "Untitled Question Bank",
    body: `Practice and previous-year questions share one grammar. Mark the correct option with a trailing \`*\` (or an \`Answer:\` line); \`Source:\`/\`Exam:\`/\`Year:\` stamp the exam badge; \`Solution:\` holds the worked answer — as short or as detailed as the question deserves. Choose where answers appear (solved inline, at the end, or hidden) in the settings pane.

## Unit 1 — Political Theory

Q. Who described political science as "the master science"?
A) Plato
B) Aristotle *
C) Machiavelli
D) Harold Laski
Source: UGC-NET Dec 2023
Solution: Aristotle called politics the master science because it determines what other sciences should be studied within the state.

Q. The concept of "Judicial Review" in the Indian Constitution is borrowed from —
A) United Kingdom
B) United States *
C) Ireland
D) Canada
Source: UPSC CSE 2021
Topic: Sources of the Constitution
Solution: Judicial review — the power of courts to test laws against the Constitution — is drawn from the **United States**. India adopts a moderated form: unlike the American "due process", Indian courts review under "procedure established by law" (Article 21).

| Source country | Borrowed feature |
|---|---|
| United States | Judicial review, fundamental rights |
| United Kingdom | Parliamentary government |
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

> Tip: switch on **Flash-card deck** in the settings pane to print each \`##\` block as a cut-out card instead.
`,
  },

  universal: {
    title: "Untitled Document",
    body: `# Document Title

A clean, brand-neutral template for any Markdown document — reports, manuals, articles, meeting notes, personal writing. No institute branding, no watermark, no selling points: just your content, typeset well.

## Getting Started

Everything the studio supports works here:

- **Bold**, *italic*, ==highlight==, ++underline++, ~~strikethrough~~
- Tables, task lists, footnotes, block quotes
- Callout boxes (\`::: note\` … \`:::\`)
- Images — paste, drag in, or use the toolbar
- \`\\pagebreak\` on its own line to start a new page

::: note
Set an institute name in the settings pane only if you want a publisher line on the cover — by default the cover carries just your title, subtitle and author.
:::

## Structure

Use \`#\` for the document title, \`##\` and \`###\` for sections — they build the table of contents and the running page header automatically.
`,
  },
};
