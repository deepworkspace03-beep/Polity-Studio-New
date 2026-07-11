import type { Doc, TemplateId } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { renderInline, renderMarkdown } from "../markdown/renderer";
import { parseMcq, type McqQuestion } from "../markdown/mcq";
import notesCss from "../pdf/styles/notes.css?raw";
import revisionCss from "../pdf/styles/revision.css?raw";
import mcqCss from "../pdf/styles/mcq.css?raw";
import pyqCss from "../pdf/styles/pyq.css?raw";
import flashcardsCss from "../pdf/styles/flashcards.css?raw";

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

function revisionBody(doc: Doc): BuiltBody {
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: ["Rapid Revision Notes", "Last-Minute Ready"],
  };
}

function questionCard(q: McqQuestion, inline: boolean): string {
  const chips: string[] = [];
  if (q.topic) chips.push(`<span class="qchip">${escapeHtml(q.topic)}</span>`);
  if (q.source) chips.push(`<span class="qchip qchip--source">${escapeHtml(q.source)}</span>`);
  if (q.marks) chips.push(`<span class="qchip">${escapeHtml(q.marks)} marks</span>`);

  const options = q.options
    .map(
      (o) =>
        `<li class="q__opt${inline && o.correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span></li>`,
    )
    .join("\n");

  const inlineAnswer =
    inline && q.explanation
      ? `<div class="q__answer"><div class="q__answer-label">Answer — ${q.answer || "—"}</div><div class="q__answer-body">${renderMarkdown(q.explanation)}</div></div>`
      : "";

  return `<article class="q" data-line="${q.line}">
  <div class="q__head"><span class="q__num">Q${q.number}</span><span class="q__chips">${chips.join("")}</span></div>
  <div class="q__text">${renderMarkdown(q.text)}</div>
  <ol class="q__options">${options}</ol>
  ${inlineAnswer}
</article>`;
}

function mcqBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const inline = doc.layout.answers === "inline";
  const withKey = doc.layout.answers !== "none";

  const preamble = parsed.preamble ? `<section class="mcq-preamble">${renderMarkdown(parsed.preamble)}</section>` : "";

  const sectionsHtml = parsed.sections
    .map((s, si) => {
      const header = s.title
        ? `<header class="mcq-section"><span class="mcq-section__num">${String(si + 1).padStart(2, "0")}</span><h2 id="sec-${si + 1}">${renderInline(s.title)}</h2></header>`
        : "";
      const intro = s.intro.trim() ? `<div class="mcq-section__intro">${renderMarkdown(s.intro)}</div>` : "";
      return `${header}${intro}${s.questions.map((q) => questionCard(q, inline)).join("\n")}`;
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
    withKey && !inline && withExplanations.length > 0
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
      `${parsed.total} Practice Question${parsed.total === 1 ? "" : "s"}`,
      withKey ? "With Answer Key & Explanations" : "Practice Booklet",
    ],
  };
}

/* ── PYQ collection ──────────────────────────────────────────────────
   A previous-year-questions collection is published very differently
   from an MCQ test: every question is self-contained — its answer and
   worked solution (often a table) sit right under it, and the exam/year
   it came from is the headline, not a footnote. So rather than reuse the
   MCQ card (which hides answers to a back-of-book key), PYQ gets its own
   card: source badge up top, always-visible solution, no answer key. */
function pyqCard(q: McqQuestion): string {
  const badge = q.source
    ? `<span class="pyq__exam">${escapeHtml(q.source)}</span>`
    : "";
  const meta: string[] = [];
  if (q.topic) meta.push(`<span class="qchip">${escapeHtml(q.topic)}</span>`);
  if (q.marks) meta.push(`<span class="qchip">${escapeHtml(q.marks)} marks</span>`);

  const options = q.options
    .map(
      (o) =>
        `<li class="q__opt${o.correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span></li>`,
    )
    .join("\n");

  const solution = q.explanation
    ? `<div class="pyq__sol"><div class="pyq__sol-label">Solution</div><div class="pyq__sol-body">${renderMarkdown(q.explanation)}</div></div>`
    : "";
  const answerLine = q.answer
    ? `<div class="pyq__answer"><span class="pyq__answer-label">Correct Answer</span><span class="pyq__answer-key">${escapeHtml(q.answer)}</span></div>`
    : "";

  return `<article class="q pyq" data-line="${q.line}">
  <div class="pyq__head"><span class="q__num">Q${q.number}</span>${badge}</div>
  ${meta.length ? `<div class="q__chips">${meta.join("")}</div>` : ""}
  <div class="q__text">${renderMarkdown(q.text)}</div>
  <ol class="q__options">${options}</ol>
  ${answerLine}
  ${solution}
</article>`;
}

function pyqBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const sectionsHtml = parsed.sections
    .map((s, si) => {
      const header = s.title
        ? `<header class="mcq-section"><span class="mcq-section__num">${String(si + 1).padStart(2, "0")}</span><h2 id="sec-${si + 1}">${renderInline(s.title)}</h2></header>`
        : "";
      const intro = s.intro.trim() ? `<div class="mcq-section__intro">${renderMarkdown(s.intro)}</div>` : "";
      return `${header}${intro}${s.questions.map((q) => pyqCard(q)).join("\n")}`;
    })
    .join("\n");
  const preamble = parsed.preamble ? `<section class="mcq-preamble">${renderMarkdown(parsed.preamble)}</section>` : "";
  return {
    html: `${preamble}<main class="mcq pyq-doc">${sectionsHtml}</main>`,
    coverLines: [
      `${parsed.total} Previous-Year Question${parsed.total === 1 ? "" : "s"}`,
      "Solved & Exam-Tagged",
    ],
  };
}

function flashcardsBody(doc: Doc): BuiltBody {
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

/* ── Registry ──────────────────────────────────────────────────────── */

export const TEMPLATE_RENDERERS: Record<TemplateId, TemplateRenderer> = {
  notes: { css: notesCss, buildBody: notesBody },
  revision: { css: revisionCss, buildBody: revisionBody },
  mcq: { css: mcqCss, buildBody: mcqBody },
  pyq: { css: mcqCss + "\n" + pyqCss, buildBody: pyqBody },
  flashcards: { css: flashcardsCss, buildBody: flashcardsBody },
};
