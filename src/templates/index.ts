import type { Doc, TemplateId } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { renderInline, renderMarkdown } from "../markdown/renderer";
import { parseMcq, type McqQuestion } from "../markdown/mcq";
import notesCss from "../pdf/styles/notes.css?raw";
import revisionCss from "../pdf/styles/revision.css?raw";
import questionsCss from "../pdf/styles/questions.css?raw";
import universalCss from "../pdf/styles/universal.css?raw";

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

function universalBody(doc: Doc): BuiltBody {
  return {
    html: `<main class="doc doc--universal">${renderMarkdown(doc.body)}</main>`,
    coverLines: ["Study Material", "Exam-Ready"],
  };
}

/* ── Question Bank ───────────────────────────────────────────────────
   One card serves PYQs, MCQs, mixed banks and practice sets — the
   answers mode decides how much each card reveals:

     inline — the examination-book study layout: the correct option is
              highlighted with a ✓ and the worked solution (when one
              exists) sits right under the question. No separate
              "Correct Answer" line — the highlight carries it.
     end    — a practice test: clean cards, answer key + explanations
              collected at the back of the booklet.
     none   — a plain question paper, nothing revealed.

   The header row is label-free: number (left) · topic (center) ·
   source (right) — the content itself is sufficient. Each card carries
   id="q-N" so "Question N" cross-references and PDF links resolve. */

/** The ✓ on the correct option is an inline SVG stroke, not a text
    glyph: the bundled font subsets don't cover U+2713, so a text tick
    would silently vanish from the exported PDF — vector marks render
    identically in preview, PDF and HTML export (see ARCHITECTURE.md
    design decision 6). */
const TICK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.8l5 5L19.5 6.8"/></svg>';

function questionCard(q: McqQuestion, reveal: boolean): string {
  const marks = q.marks ? `<span class="q__marks">${escapeHtml(q.marks)} marks</span>` : "";
  const topic = q.topic ? `<span class="q__topic">${renderInline(q.topic)}</span>` : "";
  const source = q.source || marks ? `<span class="q__src">${q.source ? escapeHtml(q.source) : ""}${marks}</span>` : "";
  // The dotted leader soaks up whatever width topic + source leave over,
  // so the header always spans the full card — book-style, never gappy.
  const lead = `<span class="q__lead" aria-hidden="true"></span>`;

  const options = q.options
    .map((o) => {
      const correct = reveal && o.correct;
      return `<li class="q__opt${correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span>${correct ? `<span class="q__tick" role="img" aria-label="Correct option">${TICK_SVG}</span>` : ""}</li>`;
    })
    .join("\n");

  // Optional by design: no solution, no reserved space.
  const solution =
    reveal && q.explanation
      ? `<div class="q__sol"><div class="q__sol-label">Solution</div><div class="q__sol-body">${renderMarkdown(q.explanation, { refIds: false })}</div></div>`
      : "";

  return `<article class="q" id="q-${q.number}" data-line="${q.line}">
  <header class="q__head"><span class="q__num">Q${q.number}</span>${topic}${lead}${source}</header>
  <div class="q__text">${renderMarkdown(q.text, { refIds: false })}</div>
  <ol class="q__options">${options}</ol>
  ${solution}
</article>`;
}

function questionsBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const mode = doc.layout.answers;
  const inline = mode === "inline";

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
    <div class="exp__head"><span class="exp__num"><a href="#q-${q.number}">Q${q.number}</a></span><span class="exp__answer">Correct answer: <strong>${q.answer || "—"}</strong></span></div>
    <div class="exp__body">${renderMarkdown(q.explanation!, { refIds: false })}</div>
  </article>`,
    )
    .join("\n")}
</section>`
      : "";

  const solved = questions.some((q) => q.explanation);
  const subtitle = inline
    ? solved
      ? "Solved & Exam-Tagged"
      : "With Answers Marked"
    : mode === "end"
      ? solved
        ? "With Answer Key & Explanations"
        : "With Answer Key"
      : "Practice Booklet";

  return {
    html: `${preamble}<main class="mcq">${sectionsHtml}</main>${answerKey}${explanations}`,
    coverLines: [`${parsed.total} Question${parsed.total === 1 ? "" : "s"}`, subtitle],
  };
}

/* ── Registry ──────────────────────────────────────────────────────── */

export const TEMPLATE_RENDERERS: Record<TemplateId, TemplateRenderer> = {
  notes: { css: notesCss, buildBody: notesBody },
  questions: { css: questionsCss, buildBody: questionsBody },
  revision: { css: revisionCss, buildBody: revisionBody },
  universal: { css: universalCss, buildBody: universalBody },
};
