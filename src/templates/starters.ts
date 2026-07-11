import type { TemplateId } from "../lib/types";

/** Starter content for new documents — enough to demonstrate the
    supported syntax for each template. */
export const STARTERS: Record<TemplateId, { title: string; body: string }> = {
  notes: {
    title: "Untitled Theory Notes",
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

  revision: {
    title: "Untitled Quick Revision",
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
`,
  },

  mcq: {
    title: "Untitled MCQ Booklet",
    body: `Attempt all questions. Each question carries 2 marks. There is no negative marking.

## Section A — Political Theory

Q. Who described political science as "the master science"?
A) Plato
B) Aristotle *
C) Machiavelli
D) Harold Laski
Explanation: Aristotle called politics the master science because it determines what other sciences should be studied within the state.
Topic: Greek Political Thought
Source: UGC-NET Dec 2023

Q. "The Republic" of Plato is primarily a treatise on —
A) Education *
B) Warfare
C) Economics
D) Diplomacy
Explanation: Rousseau called The Republic "the finest treatise on education ever written" — its central concern is the education scheme for guardians.
Topic: Plato
Source: UGC-NET June 2024
`,
  },

  pyq: {
    title: "Untitled PYQ Collection",
    body: `Previous-year questions with the correct answer and a worked solution under each one. Add \`Year:\` or \`Exam:\` to stamp the source badge.

## Indian Polity

Q. The concept of "Judicial Review" in the Indian Constitution is borrowed from —
A) United Kingdom
B) United States *
C) Ireland
D) Canada
Answer: B
Exam: UPSC CSE 2021
Solution: Judicial review — the power of courts to test laws against the Constitution — is drawn from the **United States**. India adopts a moderated form: unlike the American "due process", Indian courts review under "procedure established by law" (Article 21).

Q. Which schedule of the Constitution deals with the allocation of seats in the Rajya Sabha?
A) Third Schedule
B) Fourth Schedule *
C) Fifth Schedule
D) Sixth Schedule
Answer: B
Exam: SSC CGL 2022
Solution: The **Fourth Schedule** allocates Rajya Sabha seats to states and union territories.

| Schedule | Subject |
|----------|---------|
| Third | Forms of oaths and affirmations |
| Fourth | Rajya Sabha seat allocation |
| Fifth | Administration of Scheduled Areas |
`,
  },

  flashcards: {
    title: "Untitled Flash Cards",
    body: `# Deck Title

One line about what this deck covers.

## Who called man "a political animal"?

**Aristotle**, in *Politics* — society precedes the individual.

## The Republic's subtitle?

**"Concerning Justice"** — Plato's central question.

## Grotius is the father of…

**International law** — *De Jure Belli ac Pacis* (1625).
`,
  },
};
