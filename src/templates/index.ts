import type { AnswersMode, Doc, TemplateId } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { renderInline, renderMarkdown } from "../markdown/renderer";
import { parseMcq, topicRevealsAnswer, type McqQuestion } from "../markdown/mcq";
import notesCss from "../pdf/styles/notes.css?raw";
import revisionCss from "../pdf/styles/revision.css?raw";
import questionBankCss from "../pdf/styles/question-bank.css?raw";

/**
 * Template registry — the single place a document type is defined.
 * A template contributes its metadata, starter content, print styles
 * and a body builder; covers, TOC, page chrome and the closing page are
 * shared and handled by the document builder.
 */

export interface BuiltBody {
  html: string;
  /** Selling-point lines shown on the cover. */
  coverLines: string[];
}

export interface TemplateRenderer {
  css: string;
  buildBody(doc: Doc): BuiltBody;
}

/* ── Body builders ─────────────────────────────────────────────────── */

function notesBody(doc: Doc): BuiltBody {
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: ["Premium Study Notes", "Exam-Ready Coverage"],
  };
}

function universalBody(doc: Doc): BuiltBody {
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: [],
  };
}

/* ── Question Bank (MCQs + previous-year questions, one template) ────
   A question tagged with a Source (exam/paper/year) reads as a
   previous-year question — headline exam badge, answer revealed inline
   when layout.answers is "inline". A question with no Source reads as a
   plain practice MCQ. Every question uses the same parser and card;
   layout.answers is the only thing that changes what's visible. */

function headerChips(q: McqQuestion, unit: string): string {
  const chips: string[] = [];
  if (unit) chips.push(`<span class="qchip qchip--unit">${escapeHtml(unit)}</span>`);
  if (q.topic && !topicRevealsAnswer(q)) chips.push(`<span class="qchip">${escapeHtml(q.topic)}</span>`);
  if (q.marks) chips.push(`<span class="qchip">${escapeHtml(q.marks)} marks</span>`);
  return chips.join("");
}

function questionBankCard(q: McqQuestion, answers: AnswersMode, unit: string): string {
  const reveal = answers === "inline";
  const sourceBadge = q.source ? `<span class="pyq__exam">${escapeHtml(q.source)}</span>` : "";

  const options = q.options
    .map((o) => {
      const correct = reveal && o.correct;
      return `<li class="q__opt${correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span>${correct ? `<span class="q__check" aria-hidden="true">✓</span>` : ""}</li>`;
    })
    .join("\n");

  const solution =
    reveal && q.explanation
      ? `<div class="pyq__sol"><div class="pyq__sol-label">Solution</div><div class="pyq__sol-body">${renderMarkdown(q.explanation)}</div></div>`
      : "";

  // A long inline solution must be free to break across pages — only the
  // head+text+options "prompt" stays welded together (see question-bank.css).
  const long = reveal && !!q.explanation;
  return `<article class="q${sourceBadge ? " pyq" : ""}${long ? " q--long" : ""}" data-line="${q.line}">
  <div class="q__prompt">
    <div class="q__head"><span class="q__num">Q${q.number}</span><span class="q__chips">${headerChips(q, unit)}</span>${sourceBadge}</div>
    <div class="q__text">${renderMarkdown(q.text)}</div>
    <ol class="q__options">${options}</ol>
  </div>
  ${solution}
</article>`;
}

function questionBankBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const answers = doc.layout.answers;
  const reveal = answers === "inline";
  const withKey = answers !== "none";

  const preamble = parsed.preamble ? `<section class="mcq-preamble">${renderMarkdown(parsed.preamble)}</section>` : "";

  const sectionsHtml = parsed.sections
    .map((s, si) => {
      const header = s.title
        ? `<header class="mcq-section"><span class="mcq-section__num">${String(si + 1).padStart(2, "0")}</span><h2 id="sec-${si + 1}">${renderInline(s.title)}</h2></header>`
        : "";
      const intro = s.intro.trim() ? `<div class="mcq-section__intro">${renderMarkdown(s.intro)}</div>` : "";
      return `${header}${intro}${s.questions.map((q) => questionBankCard(q, answers, s.title)).join("\n")}`;
    })
    .join("\n");

  const questions = parsed.sections.flatMap((s) => s.questions);

  const answerKey =
    withKey && parsed.total > 0
      ? `<section class="answer-key">
  <h2 class="block-title" id="answer-key">Answer Key</h2>
  <div class="key">${questions.map((q) => `<div class="key__cell"><span class="key__q">${q.number}</span><span class="key__a">${q.answer || "—"}</span></div>`).join("")}</div>
</section>`
      : "";

  const withExplanations = questions.filter((q) => q.explanation);
  const explanations =
    withKey && !reveal && withExplanations.length > 0
      ? `<section class="explanations">
  <h2 class="block-title" id="explanations">Explanations</h2>
  ${withExplanations
    .map(
      (q) => `<article class="exp">
    <div class="exp__head"><span class="exp__num">Q${q.number}</span><span class="exp__answer">Correct answer: <strong>${q.answer || "—"}</strong></span></div>
    <div class="exp__body">${renderMarkdown(q.explanation!)}</div>
  </article>`,
    )
    .join("\n")}
</section>`
      : "";

  return {
    html: `${preamble}<main class="mcq">${sectionsHtml}</main>${answerKey}${explanations}`,
    coverLines: [
      `${parsed.total} Question${parsed.total === 1 ? "" : "s"}`,
      withKey ? (reveal ? "Solved & Exam-Tagged" : "With Answer Key & Explanations") : "Practice Booklet",
    ],
  };
}

/* ── Revision (summary notes or a flashcard deck) ─────────────────── */

function revisionSummaryBody(doc: Doc): BuiltBody {
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: ["Rapid Revision Notes", "Last-Minute Ready"],
  };
}

function revisionCardsBody(doc: Doc): BuiltBody {
  const lines = doc.body.split(/\r?\n/);
  const cards: { front: string; back: string[]; line: number }[] = [];
  const intro: string[] = [];
  let current: { front: string; back: string[]; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      current = { front: h[1].trim(), back: [], line: i + 1 };
      cards.push(current);
    } else if (current) {
      current.back.push(line);
    } else if (!/^#\s/.test(line)) {
      intro.push(line);
    }
  }
  const introHtml = intro.join("\n").trim() ? `<section class="deck-intro">${renderMarkdown(intro.join("\n"))}</section>` : "";
  const cardsHtml = cards
    .map(
      (c, i) => `<article class="fcard" data-line="${c.line}">
  <div class="fcard__front"><span class="fcard__num">${String(i + 1).padStart(2, "0")}</span>${renderInline(c.front)}</div>
  <div class="fcard__back">${renderMarkdown(c.back.join("\n"))}</div>
</article>`,
    )
    .join("\n");
  return {
    html: `${introHtml}<main class="deck">${cardsHtml}</main>`,
    coverLines: [`${cards.length} Active-Recall Card${cards.length === 1 ? "" : "s"}`, "Cut-Out Study Deck"],
  };
}

function revisionBody(doc: Doc): BuiltBody {
  return doc.layout.revisionStyle === "cards" ? revisionCardsBody(doc) : revisionSummaryBody(doc);
}

/* ── Registry ──────────────────────────────────────────────────────── */

export const TEMPLATE_RENDERERS: Record<TemplateId, TemplateRenderer> = {
  notes: { css: notesCss, buildBody: notesBody },
  "question-bank": { css: questionBankCss, buildBody: questionBankBody },
  revision: { css: revisionCss, buildBody: revisionBody },
  // Universal reuses the Notes body/CSS wholesale — same typography and
  // chapter-style headings, just without the fixed branding (handled in
  // pdf/document.ts, gated on doc.template) and with its own starter.
  universal: { css: notesCss, buildBody: universalBody },
};
