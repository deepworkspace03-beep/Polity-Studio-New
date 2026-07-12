import { describe, expect, it } from "vitest";
import { looksLikeQuestionBank, normalizeQuestionText } from "./questionText";

describe("looksLikeQuestionBank", () => {
  it("detects bracket-numbered papers ([n/total])", () => {
    const text = "[1/23] Who wrote the Constitution?\n(1) A (2) B\n[2/23] Next one?\n(1) A (2) B";
    expect(looksLikeQuestionBank(text)).toBe(true);
  });

  it("detects Q./Que. numbering paired with answers", () => {
    const text = [
      "Q1. Who was the first PM?",
      "(1) Nehru (2) Patel (3) Bose (4) Gandhi",
      "Answer: (1)",
      "Q2. Who wrote the Constitution?",
      "(1) A (2) B (3) C (4) D",
      "Ans: (2)",
      "Q3. Third question?",
      "(1) A (2) B (3) C (4) D",
    ].join("\n");
    expect(looksLikeQuestionBank(text)).toBe(true);
  });

  it("rejects ordinary prose", () => {
    const text = "This is a normal paragraph about political theory.\nIt has no question structure at all.";
    expect(looksLikeQuestionBank(text)).toBe(false);
  });

  it("rejects a single question (needs at least 2 for the bracket form)", () => {
    expect(looksLikeQuestionBank("[1/23] Only one question here\n(1) A (2) B")).toBe(false);
  });
});

describe("normalizeQuestionText", () => {
  it("extracts question, options and answer into the clean dialect", () => {
    const raw = [
      "Q1. Who called political science the master science?",
      "(1) Plato",
      "(2) Aristotle",
      "(3) Machiavelli",
      "(4) Laski",
      "Answer: (2)",
    ].join("\n");
    const { markdown, questions } = normalizeQuestionText(raw);
    expect(questions).toBe(1);
    expect(markdown).toContain("Q. Who called political science the master science?");
    expect(markdown).toContain("(2) Aristotle");
    expect(markdown).toContain("Answer: (2)");
  });

  it("splits options packed on one line", () => {
    const raw = ["Q1. When was it enacted?", "(1) 2006   (2) 2002", "(3) 2010  (4) 1999", "Answer: (1)"].join("\n");
    const { markdown } = normalizeQuestionText(raw);
    expect(markdown).toContain("(1) 2006");
    expect(markdown).toContain("(2) 2002");
    expect(markdown).toContain("(3) 2010");
    expect(markdown).toContain("(4) 1999");
  });

  it("extracts a trailing exam/year tag as the source", () => {
    const raw = ["Q1. What is the capital? (UPSC 2021)", "(1) A (2) B (3) C (4) D", "Answer: (1)"].join("\n");
    const { markdown } = normalizeQuestionText(raw);
    expect(markdown).toContain("Source: UPSC 2021");
    expect(markdown).not.toContain("(UPSC 2021)");
  });

  it("keeps arrange-type A–E statements distinct from (1)–(4) options", () => {
    const raw = [
      "Q1. Arrange the following in chronological order:",
      "A. First event",
      "B. Second event",
      "C. Third event",
      "(1) A, B, C",
      "(2) B, A, C",
      "(3) C, B, A",
      "(4) A, C, B",
      "Answer: (1)",
    ].join("\n");
    const { markdown } = normalizeQuestionText(raw);
    expect(markdown).toContain("- **A.** First event");
    expect(markdown).toContain("- **B.** Second event");
    expect(markdown).toContain("(1) A, B, C");
  });

  it("captures a Detailed Solution block after the answer", () => {
    const raw = [
      "Q1. What is federalism?",
      "(1) A (2) B (3) C (4) D",
      "Answer: (3)",
      "Detailed Solution: Federalism divides power between center and states.",
    ].join("\n");
    const { markdown } = normalizeQuestionText(raw);
    expect(markdown).toContain("Solution:");
    expect(markdown).toContain("Federalism divides power");
  });

  it("preserves non-question preamble text and section headers", () => {
    const raw = ["Unit 1: Political Theory", "", "Q1. First question?", "(1) A (2) B (3) C (4) D", "Answer: (1)"].join(
      "\n",
    );
    const { markdown } = normalizeQuestionText(raw);
    expect(markdown).toContain("## Unit 1: Political Theory");
  });
});
