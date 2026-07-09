/**
 * Reusable prompt workflows for educational content. Each workflow is a
 * plain instruction applied to the selected text (or whole document) —
 * adding a new one is adding an entry here.
 */

export const SYSTEM_PROMPT = `You are an expert editorial assistant for educational study material written in Markdown, working inside Polity Studio (Political Science exam preparation).
Rules:
- Respond with valid Markdown only — no commentary, no surrounding code fences.
- Preserve every fact, name, date and citation; never invent content.
- You may use these callout blocks where they genuinely help:
  ::: definition Term / ::: important / ::: tip / ::: exam / ::: summary / ::: example / ::: note / ::: warning  (each closed with :::)
- Use **bold** for key terms, tables for comparisons, and clear heading hierarchy (#, ##, ###).`;

export interface Workflow {
  id: string;
  label: string;
  prompt: string;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "beautify",
    label: "Beautify & organize",
    prompt:
      "Reformat and polish these notes for readability — clean heading hierarchy, tight bullet points, consistent bold key terms, definitions moved into ::: definition callouts. Keep all facts and meaning intact.",
  },
  {
    id: "exam-notes",
    label: "Convert to exam notes",
    prompt:
      "Convert this content into concise exam-oriented notes — key terms bolded, definitions in callout boxes, and a short ::: exam callout at the end of each major section listing likely question angles.",
  },
  {
    id: "revision",
    label: "Quick revision notes",
    prompt: "Condense this content into short, quick-revision notes using terse bullet points grouped under headings — suitable for last-minute review.",
  },
  {
    id: "summary",
    label: "Summarize",
    prompt: "Write a concise summary (150–200 words) of this content in Markdown.",
  },
  {
    id: "tables",
    label: "Turn comparisons into tables",
    prompt: "Identify comparable concepts, thinkers or events in this content and present them as Markdown tables where that improves clarity. Keep surrounding prose that a table cannot capture.",
  },
  {
    id: "flowchart",
    label: "Extract flow / hierarchy",
    prompt:
      "Identify processes, hierarchies or cause-effect chains in this content and present each as an indented outline (nested bullet list) that reads like a flowchart. Keep labels short.",
  },
  {
    id: "improve-english",
    label: "Improve English",
    prompt: "Improve the grammar, clarity and flow of this content without changing its meaning or structure.",
  },
  {
    id: "highlight-facts",
    label: "Bold exam-relevant facts",
    prompt: "Rewrite this content bolding all important facts, dates, names, works and figures that are likely exam-relevant. Change nothing else.",
  },
  {
    id: "mcq",
    label: "Generate practice MCQs",
    prompt: `Create high-quality multiple-choice practice questions from this content using exactly this plain-text format (no markdown lists):

Q. Question text?
A) Option
B) Correct option *
C) Option
D) Option
Explanation: One-paragraph explanation.
Difficulty: Easy | Moderate | Hard
Topic: Short topic label

Write 8–12 questions covering the most examinable points.`,
  },
  {
    id: "flashcards",
    label: "Generate flash cards",
    prompt:
      'Convert the most examinable points of this content into flash cards using exactly this format: each card is a "## Question or prompt" heading followed by the short answer as body text (bold the key term).',
  },
];
