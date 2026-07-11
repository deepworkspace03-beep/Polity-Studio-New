/**
 * MCQ syntax — designed to be typed (or pasted) by a non-programmer:
 *
 *   ## Unit 1 — Political Theory          ← "##" headings start a section
 *
 *   Q. Who called political science "the master science"?
 *   A) Plato
 *   B) Aristotle *                        ← trailing * marks the answer
 *   C) Machiavelli
 *   D) Laski
 *   Answer: B                             ← …or write it explicitly
 *   Explanation: Aristotle decided what other sciences belong in a state.
 *   Topic: Greek Political Thought
 *   Source: UGC-NET Dec 2023
 *
 * Options also accept "a)", "(a)", "1.", "A." — whatever the author
 * pastes from old papers usually just works. The answer/solution/source
 * labels have aliases too (Ans, Correct Answer, Sol, Solution, Detailed
 * Solution, Year, Exam) so PYQ banks pasted verbatim need no relabeling.
 */

export interface McqIssue {
  level: "error" | "warning" | "info";
  message: string;
  line?: number;
}

export interface McqOption {
  key: string;
  text: string;
  correct: boolean;
}

export interface McqQuestion {
  number: number;
  givenNumber?: number;
  text: string;
  options: McqOption[];
  answer?: string;
  explanation?: string;
  topic?: string;
  source?: string;
  marks?: string;
  line: number;
}

export interface McqSection {
  title: string;
  intro: string;
  questions: McqQuestion[];
  line: number;
}

export interface McqDocument {
  preamble: string;
  sections: McqSection[];
  issues: McqIssue[];
  total: number;
}

const QUESTION_RE = /^Q\s*(\d+)?\s*[.):]\s*(.*)$/i;
const OPTION_RE = /^\(?([A-Ea-e1-5])[).:]\s+(.*)$/;
// Metadata labels recognized after a question. Real papers (and PYQ
// banks pasted from PDFs) use many spellings for the same three ideas —
// the answer, the worked solution, and where the question came from —
// so we alias them all rather than force one house style:
//   answer      ← Answer / Ans / Correct Answer / Correct Option
//   explanation ← Explanation / Exp / Solution / Sol / Detailed Solution
//   source      ← Source / Year / Exam   (PYQ provenance, e.g. "UPSC 2021")
// "Difficulty"/"Level" stay recognized-but-dropped so older documents
// don't bleed those lines into the next field (see templates/index.ts).
const META_RE =
  /^(Correct Answer|Correct Option|Answer|Ans|Detailed Solution|Explanation|Solution|Exp|Sol|Difficulty|Level|Topic|Source|Marks|Year|Exam)\s*[:：—]\s*(.*)$/i;
const SECTION_RE = /^##\s+(.*)$/;

const KEY_FOR: Record<string, string> = {
  "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
  a: "A", b: "B", c: "C", d: "D", e: "E",
  A: "A", B: "B", C: "C", D: "D", E: "E",
};

export function parseMcq(body: string): McqDocument {
  const lines = body.split(/\r?\n/);
  const issues: McqIssue[] = [];
  const sections: McqSection[] = [];
  const preamble: string[] = [];

  let section: McqSection | null = null;
  let q: McqQuestion | null = null;
  let collecting: "text" | "option" | "explanation" | null = null;

  const ensureSection = (line: number): McqSection => {
    if (!section) {
      section = { title: "", intro: "", questions: [], line };
      sections.push(section);
    }
    return section;
  };

  const finishQuestion = () => {
    if (!q) return;
    if (!q.answer) {
      const starred = q.options.find((o) => o.correct);
      if (starred) q.answer = starred.key;
    } else {
      for (const o of q.options) o.correct = o.key === q.answer;
    }
    q.text = q.text.trim();
    if (q.explanation) q.explanation = q.explanation.trim();
    q = null;
    collecting = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const lineNo = i + 1;

    const sec = line.match(SECTION_RE);
    if (sec) {
      finishQuestion();
      section = { title: sec[1].trim(), intro: "", questions: [], line: lineNo };
      sections.push(section);
      continue;
    }
    // "#" titles are ignored — the cover carries the booklet title.
    if (/^#(?!#)/.test(line)) continue;

    const qm = line.match(QUESTION_RE);
    if (qm) {
      finishQuestion();
      const s = ensureSection(lineNo);
      q = {
        number: 0,
        givenNumber: qm[1] ? Number(qm[1]) : undefined,
        text: qm[2] || "",
        options: [],
        line: lineNo,
      };
      s.questions.push(q);
      collecting = "text";
      continue;
    }

    if (q) {
      // Options always precede the answer/solution. Once either is seen we
      // stop matching them, so a numbered list inside a worked solution
      // ("1. …", "2. …") is body text, not a phantom 5th option.
      const om = !q.answer && !q.explanation ? line.match(OPTION_RE) : null;
      if (om && q.options.length < 5) {
        let text = om[2].trim();
        let correct = false;
        if (text.endsWith("*")) {
          correct = true;
          text = text.replace(/\s*\*\s*$/, "");
        }
        const key = KEY_FOR[om[1]] ?? om[1].toUpperCase();
        q.options.push({ key, text, correct });
        collecting = "option";
        continue;
      }

      const mm = line.match(META_RE);
      if (mm) {
        const field = mm[1].toLowerCase();
        const value = mm[2].trim();
        if (field === "answer" || field === "ans" || field === "correct answer" || field === "correct option") {
          // Resolve a leading option letter — "B", "(b)", "B) Aristotle",
          // "2." — to its key, but leave a spelled-out answer untouched.
          const lead = value.match(/^\(?([A-Ea-e1-5])\)?(?:[\s.:)-]|$)/);
          q.answer = lead ? KEY_FOR[lead[1]] : value.toUpperCase();
          collecting = null;
        } else if (field === "explanation" || field === "exp" || field === "solution" || field === "sol" || field === "detailed solution") {
          q.explanation = value;
          collecting = "explanation";
        } else if (field === "difficulty" || field === "level") {
          collecting = null; // recognized, intentionally not stored — no longer rendered
        } else if (field === "topic") {
          q.topic = value;
          collecting = null;
        } else if (field === "source" || field === "year" || field === "exam") {
          // Year/Exam are PYQ provenance — fold into the source chip.
          q.source = value;
          collecting = null;
        } else if (field === "marks") {
          q.marks = value;
          collecting = null;
        }
        continue;
      }

      if (line.trim() === "") {
        if (collecting !== "explanation") collecting = null;
        else if (q.explanation) q.explanation += "\n\n";
        continue;
      }

      if (collecting === "text") {
        q.text += (q.text ? "\n" : "") + line.trim();
        continue;
      }
      if (collecting === "option" && q.options.length > 0) {
        const last = q.options[q.options.length - 1];
        let text = line.trim();
        if (text.endsWith("*")) {
          last.correct = true;
          text = text.replace(/\s*\*\s*$/, "");
        }
        last.text += " " + text;
        continue;
      }
      if (collecting === "explanation") {
        q.explanation = (q.explanation || "") + (q.explanation?.endsWith("\n\n") ? "" : "\n") + line.trim();
        continue;
      }
      issues.push({
        level: "info",
        message: `Line ${lineNo} is not part of any question and will be ignored.`,
        line: lineNo,
      });
      continue;
    }

    if (section) section.intro += line + "\n";
    else preamble.push(line);
  }
  finishQuestion();

  let n = 0;
  for (const s of sections) {
    for (const question of s.questions) {
      n += 1;
      question.number = n;
    }
  }

  return { preamble: preamble.join("\n").trim(), sections, issues, total: n };
}

/** Light validation surfaced in the editor so broken booklets are
    caught before export — errors never block, they inform. */
export function validateMcq(doc: McqDocument): McqIssue[] {
  const issues: McqIssue[] = [...doc.issues];
  if (doc.total === 0) {
    issues.push({
      level: "error",
      message: 'No questions found — each question starts with "Q." on its own line.',
    });
    return issues;
  }
  for (const s of doc.sections) {
    for (const q of s.questions) {
      const label = `Q${q.number}`;
      if (!q.text.trim()) issues.push({ level: "error", message: `${label} has no question text.`, line: q.line });
      if (q.options.length === 0) {
        issues.push({ level: "error", message: `${label} has no options.`, line: q.line });
      } else if (q.options.length < 4) {
        issues.push({ level: "warning", message: `${label} has only ${q.options.length} option(s).`, line: q.line });
      }
      const correct = q.options.filter((o) => o.correct);
      if (q.options.length > 0 && correct.length === 0 && !q.answer) {
        issues.push({
          level: "error",
          message: `${label} has no correct answer — add "*" after the option or "Answer: B".`,
          line: q.line,
        });
      }
      if (correct.length > 1) {
        issues.push({ level: "warning", message: `${label} has ${correct.length} options marked correct.`, line: q.line });
      }
      if (q.answer && !q.options.some((o) => o.key === q.answer)) {
        issues.push({ level: "error", message: `${label}: answer "${q.answer}" matches no option.`, line: q.line });
      }
    }
  }
  return issues;
}
