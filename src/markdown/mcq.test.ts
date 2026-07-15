import { describe, expect, it } from "vitest";
import { parseMcq, validateMcq } from "./mcq";

describe("parseMcq", () => {
  it("parses a basic question with a starred correct option", () => {
    const doc = parseMcq(["Q. Who called political science the master science?", "A) Plato", "B) Aristotle *", "C) Machiavelli", "D) Laski"].join("\n"));
    expect(doc.total).toBe(1);
    const q = doc.sections[0].questions[0];
    expect(q.options).toHaveLength(4);
    expect(q.answer).toBe("B");
    expect(q.options.find((o) => o.key === "B")?.correct).toBe(true);
  });

  it("prefers an explicit Answer: field over a starred option", () => {
    const doc = parseMcq(["Q. Test?", "A) One *", "B) Two", "C) Three", "D) Four", "Answer: B"].join("\n"));
    const q = doc.sections[0].questions[0];
    expect(q.answer).toBe("B");
    expect(q.options.find((o) => o.key === "B")?.correct).toBe(true);
    expect(q.options.find((o) => o.key === "A")?.correct).toBe(false);
  });

  it("resolves metadata field aliases (Ans, Sol, Exam, Year)", () => {
    const doc = parseMcq(
      ["Q. Test?", "A) One", "B) Two", "C) Three", "D) Four", "Ans: A", "Sol: Because reasons.", "Exam: UPSC 2022"].join(
        "\n",
      ),
    );
    const q = doc.sections[0].questions[0];
    expect(q.answer).toBe("A");
    expect(q.explanation).toBe("Because reasons.");
    expect(q.source).toBe("UPSC 2022");
  });

  it("splits sections on ## headings and numbers questions continuously across them", () => {
    const doc = parseMcq(
      [
        "## Unit 1",
        "Q. First?",
        "A) a B) b C) c D) d",
        "Answer: A",
        "## Unit 2",
        "Q. Second?",
        "A) a B) b C) c D) d",
        "Answer: B",
      ].join("\n"),
    );
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe("Unit 1");
    expect(doc.sections[1].title).toBe("Unit 2");
    expect(doc.sections[0].questions[0].number).toBe(1);
    expect(doc.sections[1].questions[0].number).toBe(2);
  });

  it("accepts numeric option markers (1./2./3./4.)", () => {
    const doc = parseMcq(["Q. Test?", "1. One", "2. Two *", "3. Three", "4. Four"].join("\n"));
    expect(doc.sections[0].questions[0].answer).toBe("B");
  });

  it("does not mistake a numbered list inside a solution for a 5th option", () => {
    const doc = parseMcq(
      ["Q. Test?", "A) a", "B) b *", "C) c", "D) d", "Explanation: Steps:", "1. First step", "2. Second step"].join(
        "\n",
      ),
    );
    const q = doc.sections[0].questions[0];
    expect(q.options).toHaveLength(4);
    expect(q.explanation).toContain("First step");
  });
});

describe("validateMcq", () => {
  it("flags an empty document", () => {
    const issues = validateMcq(parseMcq(""));
    expect(issues.some((i) => i.level === "error")).toBe(true);
  });

  it("flags a question with no correct answer", () => {
    const doc = parseMcq(["Q. Test?", "A) a", "B) b", "C) c", "D) d"].join("\n"));
    const issues = validateMcq(doc);
    expect(issues.some((i) => i.level === "error" && i.message.includes("no correct answer"))).toBe(true);
  });

  it("warns on fewer than 4 options", () => {
    const doc = parseMcq(["Q. Test?", "A) a *", "B) b"].join("\n"));
    const issues = validateMcq(doc);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("only 2 option"))).toBe(true);
  });

  it("warns when multiple options are marked correct", () => {
    const doc = parseMcq(["Q. Test?", "A) a *", "B) b *", "C) c", "D) d"].join("\n"));
    const issues = validateMcq(doc);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("marked correct"))).toBe(true);
  });

  it("flags an Answer: that matches no option", () => {
    const doc = parseMcq(["Q. Test?", "A) a", "B) b", "C) c", "D) d", "Answer: Z"].join("\n"));
    const issues = validateMcq(doc);
    expect(issues.some((i) => i.level === "error" && i.message.includes("matches no option"))).toBe(true);
  });

  it("passes a well-formed question with no issues", () => {
    const doc = parseMcq(["Q. Test?", "A) a", "B) b *", "C) c", "D) d"].join("\n"));
    expect(validateMcq(doc)).toHaveLength(0);
  });
});
