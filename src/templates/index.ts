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

function universalBody(doc: Doc): BuiltBody {
  // Brand-neutral by design: no default selling points on the cover —
  // the author can still add their own via Cover highlights.
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: [],
  };
}

/* ── Question Bank ───────────────────────────────────────────────────
   One template covers plain MCQ practice and solved PYQ collections;
   the difference is the per-document "answers" layout choice:

     inline — solved cards: exam badge, correct option highlighted,
              answer line and worked solution under every question
     end    — a clean test to attempt first; answer key + explanations
              collected at the back of the booklet
     none   — questions only (print-and-attempt) */

/** Words from the correct option(s) that would give the answer away if
    they appeared in the topic chip. Short/common words are ignored so
    "Sources of the Constitution" never trips on "of"/"the". */
const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "in", "on", "to", "for", "with", "by", "from", "only"]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/** True when showing the topic would reveal (or strongly hint at) the
    correct answer — e.g. Topic: "Plato" on a question whose answer is
    Plato. Such topics are dropped from the card; the section heading
    (unit) still provides the categorization. */
export function topicRevealsAnswer(topic: string, q: McqQuestion): boolean {
  const answerWords = new Set(q.options.filter((o) => o.correct).flatMap((o) => significantWords(o.text)));
  if (answerWords.size === 0) return false;
  return significantWords(topic).some((w) => answerWords.has(w));
}

/** Metadata chips shared by both card styles — topic only when it
    doesn't leak the answer. */
function questionChips(q: McqQuestion): string {
  const chips: string[] = [];
  if (q.topic && !topicRevealsAnswer(q.topic, q)) chips.push(`<span class="qchip">${escapeHtml(q.topic)}</span>`);
  if (q.marks) chips.push(`<span class="qchip">${escapeHtml(q.marks)} marks</span>`);
  return chips.join("");
}

function optionsHtml(q: McqQuestion, highlightCorrect: boolean): string {
  return q.options
    .map(
      (o) =>
        `<li class="q__opt${highlightCorrect && o.correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span></li>`,
    )
    .join("\n");
}

/** Practice card (answers "end"/"none") — source joins the chips row. */
function practiceCard(q: McqQuestion): string {
  const chips = [
    q.source ? `<span class="qchip qchip--source">${escapeHtml(q.source)}</span>` : "",
    questionChips(q),
  ].join("");
  return `<article class="q" data-line="${q.line}">
  <div class="q__head"><span class="q__num">Q${q.number}</span><span class="q__chips">${chips}</span></div>
  <div class="q__text">${renderMarkdown(q.text)}</div>
  <ol class="q__options">${optionsHtml(q, false)}</ol>
</article>`;
}

/** Solved card (answers "inline") — the PYQ layout: a single compact
    header line (number · exam badge · chips), highlighted correct
    option, answer line and the worked solution, whatever its length. */
function solvedCard(q: McqQuestion): string {
  const badge = q.source ? `<span class="pyq__exam">${escapeHtml(q.source)}</span>` : "";
  const solution = q.explanation
    ? `<div class="pyq__sol"><div class="pyq__sol-label">Solution</div><div class="pyq__sol-body">${renderMarkdown(q.explanation)}</div></div>`
    : "";
  const answerLine = q.answer
    ? `<div class="pyq__answer"><span class="pyq__answer-label">Correct Answer</span><span class="pyq__answer-key">${escapeHtml(q.answer)}</span></div>`
    : "";
  return `<article class="q pyq" data-line="${q.line}">
  <div class="q__head"><span class="q__num">Q${q.number}</span>${badge}<span class="q__chips">${questionChips(q)}</span></div>
  <div class="q__text">${renderMarkdown(q.text)}</div>
  <ol class="q__options">${optionsHtml(q, true)}</ol>
  ${answerLine}
  ${solution}
</article>`;
}

function qbankBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const mode = doc.layout.answers;
  const solved = mode === "inline";

  const preamble = parsed.preamble ? `<section class="mcq-preamble">${renderMarkdown(parsed.preamble)}</section>` : "";

  const sectionsHtml = parsed.sections
    .map((s, si) => {
      const header = s.title
        ? `<header class="mcq-section"><span class="mcq-section__num">${String(si + 1).padStart(2, "0")}</span><h2 id="sec-${si + 1}">${renderInline(s.title)}</h2></header>`
        : "";
      const intro = s.intro.trim() ? `<div class="mcq-section__intro">${renderMarkdown(s.intro)}</div>` : "";
      return `${header}${intro}${s.questions.map((q) => (solved ? solvedCard(q) : practiceCard(q))).join("\n")}`;
    })
    .join("\n");

  const questions = parsed.sections.flatMap((s) => s.questions);

  const answerKey =
    mode === "end" && parsed.total > 0
      ? `<section class="answer-key">
  <h2 class="block-title" id="answer-key">Answer Key</h2>
  <div class="key">${questions.map((q) => `<div class="key__cell"><span class="key__q">${q.number}</span><span class="key__a">${q.answer || "—"}</span></div>`).join("")}</div>
</section>`
      : "";

  const withExplanations = questions.filter((q) => q.explanation);
  const explanations =
    mode === "end" && withExplanations.length > 0
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
    html: `${preamble}<main class="mcq${solved ? " pyq-doc" : ""}">${sectionsHtml}</main>${answerKey}${explanations}`,
    coverLines: [
      `${parsed.total} Question${parsed.total === 1 ? "" : "s"}`,
      solved ? "Solved & Exam-Tagged" : mode === "end" ? "With Answer Key & Explanations" : "Practice Booklet",
    ],
  };
}

/* ── Revision ────────────────────────────────────────────────────────
   Compact continuous notes by default; the "deck" layout toggle prints
   each `##` block as a cut-out flash card instead (the strongest part
   of the former Flash Cards template, kept as a layout choice). */

function deckBody(doc: Doc): BuiltBody {
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
  if (doc.layout.deck) return deckBody(doc);
  return {
    html: `<main class="doc">${renderMarkdown(doc.body)}</main>`,
    coverLines: ["Rapid Revision Notes", "Last-Minute Ready"],
  };
}

/* ── Registry ──────────────────────────────────────────────────────── */

export const TEMPLATE_RENDERERS: Record<TemplateId, TemplateRenderer> = {
  notes: { css: notesCss, buildBody: notesBody },
  // Revision ships both stylesheets: revision.css for continuous sheets,
  // flashcards.css for the deck layout (scoped to .deck/.fcard).
  revision: { css: revisionCss + "\n" + flashcardsCss, buildBody: revisionBody },
  // Question Bank layers the solved-card styles over the MCQ base.
  qbank: { css: mcqCss + "\n" + pyqCss, buildBody: qbankBody },
  // Universal adds nothing on top of the shared print foundation — no
  // chapter openers, no forced page breaks; deliberately neutral.
  universal: { css: "", buildBody: universalBody },
};
