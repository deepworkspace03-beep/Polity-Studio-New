import type { Doc, TemplateId } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { renderInline, renderMarkdown } from "../markdown/renderer";
import { parseMcq, type McqQuestion } from "../markdown/mcq";
import notesCss from "../pdf/styles/notes.css?raw";
import revisionCss from "../pdf/styles/revision.css?raw";
import mcqCss from "../pdf/styles/mcq.css?raw";
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

const DIFF_CLASS: Record<string, string> = {
  easy: "easy",
  moderate: "moderate",
  medium: "moderate",
  hard: "hard",
  difficult: "hard",
};

function questionCard(q: McqQuestion, inline: boolean): string {
  const chips: string[] = [];
  if (q.difficulty) {
    const cls = DIFF_CLASS[q.difficulty.toLowerCase()] || "moderate";
    chips.push(`<span class="qchip qchip--${cls}">${escapeHtml(q.difficulty)}</span>`);
  }
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

  return `<article class="q">
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

function flashcardsBody(doc: Doc): BuiltBody {
  const lines = doc.body.split(/\r?\n/);
  const cards: { front: string; back: string[] }[] = [];
  const intro: string[] = [];
  let current: { front: string; back: string[] } | null = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      current = { front: h[1].trim(), back: [] };
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
      (c, i) => `<article class="fcard">
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
  flashcards: { css: flashcardsCss, buildBody: flashcardsBody },
};
