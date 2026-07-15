/**
 * Question-bank normalizer — turns raw pasted/imported PYQ & MCQ text
 * into the app's clean question dialect (see markdown/mcq.ts) so a real
 * exam paper becomes a structured booklet with almost no manual editing.
 *
 * Why this exists separately from importer.ts: exam papers exported to
 * plain text (or copied from a PDF) lose all structure — questions,
 * options and answers become indistinguishable paragraphs. HTML paste
 * keeps tables and formatting, but never the *question* grammar, because
 * in the source those are ordinary paragraphs too. This module recovers
 * that grammar from the text itself, handling the patterns real papers
 * actually use rather than one idealized house style:
 *
 *   • "[3/23] …", "Q3.", "3." question markers (with a "n/total" counter)
 *   • a trailing "(June 2025)" / "(Dec 2024 Shift-2)" → the exam badge
 *   • "arrange in order" stems whose A–E lines are *statements* (part of
 *     the question) followed by the real (1)–(4) options — kept distinct
 *     so the answer key stays correct
 *   • two options packed on one line: "(1) 2006   (2) 2002"
 *   • "Answer: (3)" and an unlabeled or "Detailed Solution:" worked answer
 *
 * It is deliberately conservative: `looksLikeQuestionBank` must be
 * confident before importer.ts routes text through here, so ordinary
 * prose and already-clean MCQ bodies are never touched.
 */

const BRACKET_Q = /^\s*\[(\d+)\s*\/\s*\d+\]\s*(.*)$/; // [3/23] stem…
// Q. / Q3. / Q3) / Que. / Ques. / Question 5: — group 1 number, group 2 stem.
const PLAIN_Q = /^\s*Q(?:ue(?:s(?:tion)?)?)?\s*(\d*)\s*[.):]\s+(.*)$/i;
/** Page-footer artifacts glued into copied text ("7 | P a g e"). */
const PAGE_NOISE = /\s*\d+\s*\|\s*P\s*a\s*g\s*e\b/gi;
const SEPARATOR = /^\s*[_—–*=·—-]{6,}\s*$/; // ____ / ---- dividers between questions
const STATEMENT = /^\s*([A-Ea-e])[.)]\s+(\S.*)$/; // A. statement  (arrange-type stems)
const NUM_OPTION = /^\s*\(?([1-9])[).]\s+(\S.*)$/; // (1) option  /  1) option
const ANSWER = /^\s*(?:Answer|Ans|Correct Answer|Correct Option)\s*[:.\-—]\s*(.*)$/i;
const SOLUTION = /^\s*(?:Detailed Solution|Solution|Explanation|Sol|Exp)\s*[:.\-—]\s*(.*)$/i;
// Provenance/tagging labels that may sit between the answer and the
// worked solution. Recognized as their own fields so they are never
// swallowed into the solution block and are re-emitted in a fixed order
// (Answer → Source → Topic → Marks → Solution) the mcq parser reads
// back losslessly. Mirrors the source aliases in markdown/mcq.ts.
const SOURCE_LABEL = /^\s*(?:Source|Exam|Year)\s*[:.\-—]\s*(.*)$/i;
const TOPIC_LABEL = /^\s*(?:Topic|Syllabus)\s*[:.\-—]\s*(.*)$/i;
const MARKS_LABEL = /^\s*Marks\s*[:.\-—]\s*(.*)$/i;
const SECTION_HEAD = /^\s*(Unit[\s-]*\d+[:.\-—].*|Section\s+[A-Z0-9].*)$/i;
const URL_ONLY = /^\s*(?:Telegram|Join|Follow|Source|Channel)?\s*:?\s*https?:\/\/\S+\s*$/i;
/** Trailing "(…2024…)" / "(June 2025)" / "(…Shift-2)" on a stem = the exam. */
const TRAILING_SOURCE = /\s*\(([^()]*(?:\b(?:19|20)\d{2}\b|shift|re-?exam|cancelled|prelims?|mains?)[^()]*)\)\s*$/i;

interface RawQuestion {
  stem: string;
  source: string;
  topic: string;
  marks: string;
  statements: string[];
  options: string[];
  answer: string;
  solution: string[];
}

/** Splits "(1) foo (2) bar" into ["(1) foo", "(2) bar"] while leaving a
    single-option line untouched. Only splits before a bracketed number
    preceded by whitespace, so "(1)" inside prose stays put. */
function splitPackedOptions(line: string): string[] {
  const parts = line.split(/\s{2,}(?=\(?[1-9][).]\s)|(?<=\S)\s+(?=\([1-9]\)\s)/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function looksLikeQuestionBank(text: string): boolean {
  const bracket = (text.match(/^\s*\[\d+\s*\/\s*\d+\]/gm) || []).length;
  if (bracket >= 2) return true;
  const answers = (text.match(/^\s*(?:Correct\s+)?(?:Answer|Ans|Option)\s*[:.\-—]/gim) || []).length;
  const numOpts = (text.match(/^\s*\(?[1-9][).]\s+\S/gm) || []).length;
  const plainQ = (text.match(/^\s*Q(?:ue(?:s(?:tion)?)?)?\s*\d*\s*[.):]\s+\S/gim) || []).length;
  return (answers >= 2 && numOpts >= 4) || (plainQ >= 3 && answers >= 2);
}

/** Cleans a worked-solution block: normalizes bullet glyphs, strips the
    Google-Docs/Word tab-per-cell table flattening into a readable bullet
    list (each cell a bullet — lossless; true tables survive via HTML
    paste), and drops empty noise. */
function cleanSolution(lines: string[]): string {
  // Trim leading/trailing blanks.
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  const isCell = (i: number): boolean => {
    if (/^\t/.test(lines[i])) return true;
    // A no-tab line immediately before a tab line is the table's first
    // header cell (only that cell lacks the leading tab).
    return i + 1 < lines.length && /^\t/.test(lines[i + 1] || "") && lines[i].trim().length > 0 && lines[i].trim().length < 60;
  };

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let s = raw.replace(/\t/g, " ").trim();
    // Bullet glyphs → Markdown list markers.
    s = s.replace(/^[•·▪●○◦‣*]\s+/, "- ");
    if (isCell(i) && !/^-\s/.test(s)) s = "- " + s;
    out.push(s);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function emitQuestion(q: RawQuestion): string {
  const lines: string[] = [];
  lines.push(`Q. ${q.stem.trim()}`);
  // Arrange-type statements are part of the stem, not options — render as
  // a lettered bullet list so they never parse as answer choices.
  for (const st of q.statements) {
    const m = st.match(STATEMENT);
    lines.push(m ? `- **${m[1].toUpperCase()}.** ${m[2].trim()}` : `- ${st.trim()}`);
  }
  if (q.options.length) lines.push("");
  for (const opt of q.options) lines.push(opt);
  if (q.answer) lines.push(`Answer: ${q.answer.trim()}`);
  if (q.source) lines.push(`Source: ${q.source.trim()}`);
  if (q.topic) lines.push(`Topic: ${q.topic.trim()}`);
  if (q.marks) lines.push(`Marks: ${q.marks.trim()}`);
  const sol = cleanSolution(q.solution);
  if (sol) {
    lines.push("Solution:");
    lines.push(sol);
  }
  return lines.join("\n");
}

export function normalizeQuestionText(text: string): { markdown: string; questions: number } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B\uFEFF]/g, "")
    .replace(PAGE_NOISE, "")
    // A first option glued onto the stem end ("\u2026idea of1. Anti-") loses
    // option A \u2014 break a digit-marker off a word when a capitalized
    // choice follows. Guarded so years/prices ("Rs. 1000") are untouched,
    // and \u2014 via the lookbehind \u2014 so a legitimate "Q1. Stem\u2026" marker is
    // never split: that "Q" is never preceded by another letter, while a
    // truly glued word ending ("...of1.") always is.
    .replace(/(?<=[A-Za-z])([A-Za-z])([1-9][.)]\s+)(?=[A-Z])/g, "$1\n$2")
    .split("\n");
  const preamble: string[] = [];
  const questions: RawQuestion[] = [];
  let q: RawQuestion | null = null;
  let phase: "stem" | "options" | "meta" | "solution" = "stem";

  const start = (stem: string): RawQuestion => {
    let s = stem;
    let source = "";
    const sm = s.match(TRAILING_SOURCE);
    if (sm) {
      source = sm[1].trim();
      s = s.replace(TRAILING_SOURCE, "").trim();
    }
    const created: RawQuestion = { stem: s, source, topic: "", marks: "", statements: [], options: [], answer: "", solution: [] };
    questions.push(created);
    phase = "stem";
    return created;
  };

  for (const line of lines) {
    const bq = line.match(BRACKET_Q);
    const pq = bq ? null : line.match(PLAIN_Q);
    if (bq || pq) {
      q = start((bq ? bq[2] : pq?.[2]) || "");
      continue;
    }
    if (!q) {
      if (SEPARATOR.test(line) || URL_ONLY.test(line) || !line.trim()) continue;
      if (SECTION_HEAD.test(line)) preamble.push(`## ${line.replace(TRAILING_SOURCE, "").trim()}`);
      else preamble.push(line.trim());
      continue;
    }
    if (SEPARATOR.test(line)) continue;

    const am = line.match(ANSWER);
    if (am && phase !== "solution") {
      q.answer = am[1].trim();
      phase = "meta";
      continue;
    }
    // Between the answer and the solution (or right after the options) a
    // paper may tag the question with its source/topic/marks. Capture
    // each as its own field so it is never folded into the solution.
    if (phase === "options" || phase === "meta") {
      const srcm = line.match(SOURCE_LABEL);
      if (srcm) {
        q.source = srcm[1].trim();
        continue;
      }
      const topm = line.match(TOPIC_LABEL);
      if (topm) {
        q.topic = topm[1].trim();
        continue;
      }
      const mkm = line.match(MARKS_LABEL);
      if (mkm) {
        q.marks = mkm[1].trim();
        continue;
      }
    }
    const solm = line.match(SOLUTION);
    if (solm && phase !== "stem") {
      phase = "solution";
      if (solm[1].trim()) q.solution.push(solm[1]);
      continue;
    }
    if (phase === "solution") {
      q.solution.push(line);
      continue;
    }
    // In the meta phase an unlabeled non-empty line begins the worked
    // solution — many papers give the explanation with no "Solution:".
    if (phase === "meta") {
      if (line.trim()) {
        q.solution.push(line);
        phase = "solution";
      }
      continue;
    }

    const nm = line.match(NUM_OPTION);
    if (nm) {
      for (const part of splitPackedOptions(line)) q.options.push(part);
      phase = "options";
      continue;
    }
    const stm = line.match(STATEMENT);
    if (stm && phase !== "options") {
      q.statements.push(line.trim());
      continue;
    }
    // Continuation text.
    if (!line.trim()) continue;
    if (phase === "options" && q.options.length) {
      q.options[q.options.length - 1] += " " + line.trim();
    } else if (q.statements.length && phase === "stem") {
      q.statements[q.statements.length - 1] += " " + line.trim();
    } else {
      q.stem += (q.stem ? " " : "") + line.trim();
    }
  }

  const body = [preamble.join("\n").trim(), ...questions.map(emitQuestion)]
    .filter(Boolean)
    .join("\n\n");
  return { markdown: body.replace(/\n{3,}/g, "\n\n").trim(), questions: questions.length };
}
