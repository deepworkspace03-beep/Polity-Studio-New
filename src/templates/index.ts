import type { Doc, TemplateId } from "../lib/types";
import { escapeHtml } from "../lib/utils";
import { renderInline, renderMarkdown } from "../markdown/renderer";
import { parseMcq, type McqOption, type McqQuestion, type McqSection } from "../markdown/mcq";
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
  /** Optional content placed right after the cover, before the body —
      currently the Question Bank's clickable unit index. Kept separate
      from `html` so the document builder can insert it ahead of the
      body (and give it its own page) without the template knowing the
      cover/TOC assembly order. */
  frontMatter?: string;
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
              collected at the back of the booklet, with clickable
              "Answer →" / "↩ Question" navigation both ways.
     none   — a plain question paper, nothing revealed.

   The header row is label-free: number (left) · topic (center) ·
   source (right) — the content itself is sufficient. Each card carries
   id="q-N" so "Question N" cross-references and PDF links resolve.
   Three per-document layout switches shape the bank further (all in
   Details → Interior): qbUnitBreaks opens every "##" unit on a fresh
   page, qbTopics folds the header row away for the densest layout, and
   qbColumns=2 typesets the whole bank in the two-column examination
   format. */

/** The ✓ on the correct option is an inline SVG stroke, not a text
    glyph: the bundled font subsets don't cover U+2713, so a text tick
    would silently vanish from the exported PDF — vector marks render
    identically in preview, PDF and HTML export (see ARCHITECTURE.md
    design decision 6). */
const TICK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.8l5 5L19.5 6.8"/></svg>';

/* Options are classified at build time — never in the harness — so the
   flow preview, the paged preview and the PDF all agree on the layout:
     --row   all four options are tiny ("Plato", "1919") → one 4-across
             line, halving the option block's height;
     --long  any option runs past ~55 chars → a single readable column;
     (none)  the classic two-column examination grid. */
function optionLayoutClass(options: McqOption[]): string {
  const max = options.reduce((m, o) => Math.max(m, o.text.length), 0);
  if (max > 55) return " q__options--long";
  if (options.length === 4 && max <= 16) return " q__options--row";
  return "";
}

/* ── Assertion–Reason / Statement pairs ──────────────────────────────
   "Assertion (A): … / Reason (R): …" (and the UGC-NET "Statement I/II"
   sibling format) render as independent labeled blocks instead of one
   run-on sentence. Detection is per-line inside the stem; anything
   before the first labeled line stays as the lead-in, and the closing
   instruction ("In the light of the above statements…") stays a tail. */
const AR_LINE_RE = /^(Assertion|Reason|Statement)\s*[([]?\s*([ABRIVX12]{0,4})\s*[)\]]?\s*[:.\-—–]\s*(.*)$/i;
const AR_TAIL_RE = /^(In (the )?light of|Choose|Select|Which|From the (above|following)|Codes?\b)/i;

interface ArBlock {
  label: string;
  lines: string[];
}

function parseLabeledBlocks(text: string): { lead: string[]; blocks: ArBlock[]; tail: string[] } | null {
  const lead: string[] = [];
  const tail: string[] = [];
  const blocks: ArBlock[] = [];
  let open: ArBlock | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(AR_LINE_RE);
    if (m) {
      const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      const tag = m[2] ? m[2].toUpperCase() : kind === "Assertion" ? "A" : kind === "Reason" ? "R" : "";
      open = { label: tag ? `${kind} (${tag})` : kind, lines: m[3].trim() ? [m[3].trim()] : [] };
      blocks.push(open);
      continue;
    }
    if (open && AR_TAIL_RE.test(line.trim())) open = null;
    if (open) open.lines.push(line);
    else (blocks.length === 0 ? lead : tail).push(line);
  }
  // Only a real pair (A+R or Statement I+II…) earns the structure —
  // a lone "Statement:" line reads better as ordinary text.
  if (blocks.length < 2) return null;
  return { lead, blocks, tail };
}

function stemHtml(q: McqQuestion): string {
  const ar = parseLabeledBlocks(q.text);
  if (!ar) return renderMarkdown(q.text, { refIds: false });
  const lead = ar.lead.join("\n").trim();
  const tail = ar.tail.join("\n").trim();
  return [
    lead ? renderMarkdown(lead, { refIds: false }) : "",
    ...ar.blocks.map(
      (b) =>
        `<div class="q__st"><span class="q__st-label">${escapeHtml(b.label)}</span><div class="q__st-body">${renderInline(b.lines.join(" ").trim())}</div></div>`,
    ),
    tail ? `<p class="q__st-tail">${renderInline(tail)}</p>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Per-question extras computed once for the whole bank (solution
    de-duplication + answer navigation targets). */
interface CardContext {
  reveal: boolean;
  showTopics: boolean;
  /** q.number → the earlier question whose identical solution this one
      should reference instead of repeating. */
  solRef: Map<number, number>;
  /** q.number → later questions that share this question's solution. */
  solShared: Map<number, number[]>;
  /** q.number → PDF/anchor target for the "Answer →" jump (end mode). */
  answerTarget: Map<number, string>;
}

function questionCard(q: McqQuestion, ctx: CardContext): string {
  const marks = q.marks ? `<span class="q__marks">${escapeHtml(q.marks)} marks</span>` : "";
  const source = q.source || marks ? `<span class="q__src">${q.source ? escapeHtml(q.source) : ""}${marks}</span>` : "";
  const jumpTarget = ctx.answerTarget.get(q.number);
  const jump = jumpTarget ? `<a class="q__jump" href="#${jumpTarget}">Answer&nbsp;→</a>` : "";

  const options = q.options
    .map((o) => {
      const correct = ctx.reveal && o.correct;
      return `<li class="q__opt${correct ? " q__opt--correct" : ""}"><span class="q__key">${o.key}</span><span class="q__opt-text">${renderInline(o.text)}</span>${correct ? `<span class="q__tick" role="img" aria-label="Correct option">${TICK_SVG}</span>` : ""}</li>`;
    })
    .join("\n");

  // Optional by design: no solution, no reserved space. Identical
  // detailed solutions render once — later questions carry a one-line
  // clickable reference instead, and the original lists its sharers so
  // navigation works in both directions.
  let solution = "";
  if (ctx.reveal && q.explanation) {
    const ref = ctx.solRef.get(q.number);
    if (ref) {
      solution = `<div class="q__sol q__sol--ref"><div class="q__sol-label">Solution</div><a class="q__sol-ref" href="#q-${ref}">See Question ${ref} for the detailed explanation →</a></div>`;
    } else {
      const sharers = ctx.solShared.get(q.number);
      const shared =
        sharers && sharers.length
          ? `<div class="q__sol-shared">Also answers ${sharers
              .slice(0, 8)
              .map((n) => `<a href="#q-${n}">Q${n}</a>`)
              .join(", ")}${sharers.length > 8 ? ` +${sharers.length - 8} more` : ""}</div>`
          : "";
      solution = `<div class="q__sol"><div class="q__sol-label">Solution</div><div class="q__sol-body">${renderMarkdown(q.explanation, { refIds: false })}</div>${shared}</div>`;
    }
  }

  /* Pagination contract (see questions.css): the header and stem never
     separate, each option row is atomic, but a card may otherwise break
     — options can continue under an open box on the next page and long
     solutions flow on. data-q feeds the "continued" tag stamped on the
     continuation half. */
  const stem = stemHtml(q);
  const topic = ctx.showTopics && q.topic ? `<span class="q__topic">${renderInline(q.topic)}</span>` : "";
  const rightSide = `${source}${jump}`;

  // The header keeps Question Number, Topic/Unit (when enabled) and Source
  // together — provenance always reads in the top row, never below the
  // question. The compact number-in-stem fold is used only when the
  // header would carry the number alone (topics hidden AND no source /
  // answer-jump), so a bank with no provenance still packs tightly.
  const showHeader = ctx.showTopics || Boolean(rightSide);
  if (!showHeader) {
    return `<article class="q q--flat" id="q-${q.number}" data-q="Q${q.number}" data-line="${q.line}">
  <div class="q__main">
    <div class="q__text"><span class="q__num">Q${q.number}</span>${stem}</div>
  </div>
  <ol class="q__options${optionLayoutClass(q.options)}">${options}</ol>
  ${solution}
</article>`;
  }

  // The dotted leader soaks up whatever width the number/topic and source
  // leave over so the header spans the full card — book-style, never gappy.
  // Only present when something sits on the right, so a header with no
  // source doesn't trail a line into empty space.
  const lead = rightSide ? `<span class="q__lead" aria-hidden="true"></span>` : "";
  return `<article class="q" id="q-${q.number}" data-q="Q${q.number}" data-line="${q.line}">
  <div class="q__main">
    <header class="q__head"><span class="q__num">Q${q.number}</span>${topic}${lead}${rightSide}</header>
    <div class="q__text">${stem}</div>
  </div>
  <ol class="q__options${optionLayoutClass(q.options)}">${options}</ol>
  ${solution}
</article>`;
}

/** Identical worked solutions (whitespace-normalized, and long enough
    that repeating them wastes real space) are printed once; the map
    links every later duplicate back to the first occurrence. */
function dedupeSolutions(questions: McqQuestion[]): { solRef: Map<number, number>; solShared: Map<number, number[]> } {
  const firstByText = new Map<string, number>();
  const solRef = new Map<number, number>();
  const solShared = new Map<number, number[]>();
  for (const q of questions) {
    if (!q.explanation) continue;
    const norm = q.explanation.replace(/\s+/g, " ").trim();
    if (norm.length < 140) continue;
    const first = firstByText.get(norm);
    if (first === undefined) {
      firstByText.set(norm, q.number);
    } else {
      solRef.set(q.number, first);
      const list = solShared.get(first) ?? [];
      list.push(q.number);
      solShared.set(first, list);
    }
  }
  return { solRef, solShared };
}

/* ── Unit index (optional "Contents" page for Question Banks) ─────────
   A book-style index of the bank's units: each row is a clickable link
   to the unit, its question count, and (in the paged layout) the page
   range the unit spans. The page numbers are filled in one post-layout
   pass by the harness — the same mechanism the prose TOC uses — reading
   data-start / data-end anchor ids off each row. In the flow (pageless)
   layout there are no pages, so the range column self-hides. Only titled
   "##" units are listed; a bank with a single untitled section has no
   structure worth indexing, so the index is omitted. */
function qbIndexHtml(sections: McqSection[]): string {
  const units = sections.filter((s) => s.title.trim() && s.questions.length > 0);
  if (units.length < 1) return "";
  let si = 0;
  const rows = sections
    .map((s) => {
      // Section ids follow the sectionsHtml numbering (1-based over ALL
      // sections, titled or not) so the anchors resolve.
      si += 1;
      if (!s.title.trim() || s.questions.length === 0) return "";
      const count = s.questions.length;
      const first = s.questions[0].number;
      const last = s.questions[s.questions.length - 1].number;
      const num = String(units.indexOf(s) + 1).padStart(2, "0");
      return `<li class="qb-index__item">
      <a href="#sec-${si}">
        <span class="qb-index__num">${num}</span>
        <span class="qb-index__text">${renderInline(s.title)}</span>
        <span class="qb-index__dots" aria-hidden="true"></span>
        <span class="qb-index__count">${count} Q${count === 1 ? "" : "s"}</span>
        <span class="qb-index__page" data-start="q-${first}" data-end="q-${last}"></span>
      </a>
    </li>`;
    })
    .filter(Boolean)
    .join("\n");
  const total = units.reduce((n, s) => n + s.questions.length, 0);
  return `
<nav class="qb-index">
  <h2 class="qb-index__title">Index</h2>
  <ol class="qb-index__list">
    ${rows}
  </ol>
  <p class="qb-index__foot">${units.length} unit${units.length === 1 ? "" : "s"} · ${total} question${total === 1 ? "" : "s"}</p>
</nav>`;
}

function questionsBody(doc: Doc): BuiltBody {
  const parsed = parseMcq(doc.body);
  const mode = doc.layout.answers;
  const inline = mode === "inline";
  const showTopics = doc.layout.qbTopics !== false;
  const unitBreaks = doc.layout.qbUnitBreaks !== false;
  const twoCol = doc.layout.qbColumns === 2;

  const preamble = parsed.preamble ? `<section class="mcq-preamble">${renderMarkdown(parsed.preamble)}</section>` : "";

  const questions = parsed.sections.flatMap((s) => s.questions);
  const { solRef, solShared } = inline ? dedupeSolutions(questions) : { solRef: new Map<number, number>(), solShared: new Map<number, number[]>() };

  // End mode: every card carries a clickable "Answer →" that jumps to its
  // explanation (or its answer-key cell when there is no worked solution);
  // the explanation's own Q-number links straight back.
  const answerTarget = new Map<number, string>();
  if (mode === "end") {
    for (const q of questions) answerTarget.set(q.number, q.explanation ? `exp-${q.number}` : `key-${q.number}`);
  }

  const ctx: CardContext = { reveal: inline, showTopics, solRef, solShared, answerTarget };

  const sectionsHtml = parsed.sections
    .map((s, si) => {
      const count = s.questions.length;
      const header = s.title
        ? `<header class="mcq-section"><span class="mcq-section__num">${String(si + 1).padStart(2, "0")}</span><h2 id="sec-${si + 1}">${renderInline(s.title)}</h2><span class="mcq-section__count">${count} Q${count === 1 ? "" : "s"}</span></header>`
        : "";
      const intro = s.intro.trim() ? `<div class="mcq-section__intro">${renderMarkdown(s.intro)}</div>` : "";
      return `${header}${intro}${s.questions.map((q) => questionCard(q, ctx)).join("\n")}`;
    })
    .join("\n");

  const mainClass = ["mcq", unitBreaks ? "mcq--breaks" : "", twoCol ? "mcq--2col" : ""].filter(Boolean).join(" ");

  const answerKey =
    mode === "end" && parsed.total > 0
      ? `<section class="answer-key">
  <h2 class="block-title" id="answer-key">Answer Key</h2>
  <div class="key">${questions.map((q) => `<div class="key__cell" id="key-${q.number}"><a class="key__q" href="#q-${q.number}">${q.number}</a><span class="key__a">${q.answer || "—"}</span></div>`).join("")}</div>
</section>`
      : "";

  const withExplanations = questions.filter((q) => q.explanation);
  const endDedup = mode === "end" ? dedupeSolutions(withExplanations) : { solRef: new Map<number, number>(), solShared: new Map<number, number[]>() };
  const explanations =
    mode === "end" && withExplanations.length > 0
      ? `<section class="explanations">
  <h2 class="block-title" id="explanations">Explanations</h2>
  ${withExplanations
    .map((q) => {
      const ref = endDedup.solRef.get(q.number);
      const body = ref
        ? `<a class="q__sol-ref" href="#exp-${ref}">Shared explanation — see Question ${ref} →</a>`
        : renderMarkdown(q.explanation!, { refIds: false });
      return `<article class="exp" id="exp-${q.number}">
    <div class="exp__head"><span class="exp__num"><a href="#q-${q.number}">Q${q.number}</a></span><span class="exp__answer">Correct answer: <strong>${q.answer || "—"}</strong></span><a class="exp__back" href="#q-${q.number}">↩ Question</a></div>
    <div class="exp__body">${body}</div>
  </article>`;
    })
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

  const frontMatter = doc.layout.qbIndex ? qbIndexHtml(parsed.sections) : "";

  return {
    html: `${preamble}<main class="${mainClass}">${sectionsHtml}</main>${answerKey}${explanations}`,
    coverLines: [`${parsed.total} Question${parsed.total === 1 ? "" : "s"}`, subtitle],
    frontMatter,
  };
}

/* ── Registry ──────────────────────────────────────────────────────── */

export const TEMPLATE_RENDERERS: Record<TemplateId, TemplateRenderer> = {
  notes: { css: notesCss, buildBody: notesBody },
  questions: { css: questionsCss, buildBody: questionsBody },
  revision: { css: revisionCss, buildBody: revisionBody },
  universal: { css: universalCss, buildBody: universalBody },
};
