import { describe, expect, it } from "vitest";
import { DOC_OPTIONAL_KEYS, LAYOUT_OPTIONAL_KEYS, normalizeDoc, withDefaults } from "./store";
import { DEFAULT_LAYOUT } from "../brand/defaults";
import type { Doc } from "./types";

/**
 * Regression coverage for the schema-merge safety net (see the comment
 * above `withDefaults` in store.ts): a stored field that is legitimately
 * optional (institute, coverLines, coverColors, coverDesign) must survive
 * a load/restore even though it's absent from the in-code defaults
 * object. This is the exact class of bug the audit flagged as a
 * data-loss risk — these tests fail loudly if it regresses.
 */

const BASE_DEFAULTS = { id: "x", title: "Untitled", body: "" };

describe("withDefaults", () => {
  it("drops keys the current schema no longer knows about", () => {
    const out = withDefaults(BASE_DEFAULTS, { id: "x", title: "Kept", removedLegacyField: "gone" });
    expect(out).not.toHaveProperty("removedLegacyField");
    expect(out.title).toBe("Kept");
  });

  it("fills in newly added defaults absent from the stored object", () => {
    const out = withDefaults({ ...BASE_DEFAULTS, freshField: "default" }, { id: "x", title: "Kept" });
    expect((out as typeof out & { freshField: string }).freshField).toBe("default");
  });

  it("preserves an optional key entirely absent from defaults when listed in preserveKeys", () => {
    const out = withDefaults(BASE_DEFAULTS, { id: "x", institute: "JRF Club" }, ["institute" as keyof typeof BASE_DEFAULTS]);
    expect((out as Record<string, unknown>).institute).toBe("JRF Club");
  });

  it("drops that same optional key when preserveKeys is not passed", () => {
    const out = withDefaults(BASE_DEFAULTS, { id: "x", institute: "JRF Club" });
    expect(out).not.toHaveProperty("institute");
  });

  it("merges nested objects, keeping sibling keys from defaults untouched", () => {
    const defaults = { colors: { primary: "#000", accent: "#111" } };
    const out = withDefaults(defaults, { colors: { accent: "#222" } });
    expect(out.colors).toEqual({ primary: "#000", accent: "#222" });
  });

  it("round-trips every Doc.institute/coverLines and DocLayout.coverColors/coverDesign field through JSON without loss", () => {
    const blankDoc: Doc = {
      id: "doc-1",
      title: "Untitled",
      subtitle: "",
      template: "notes",
      body: "",
      exam: "",
      paper: "",
      session: "",
      edition: "",
      author: "Author",
      lang: "en",
      layout: { ...DEFAULT_LAYOUT },
      createdAt: 0,
      updatedAt: 0,
    };
    const stored: Doc = {
      ...blankDoc,
      institute: "Custom Institute",
      coverLines: ["Line one", "Line two"],
      layout: {
        ...DEFAULT_LAYOUT,
        coverColors: { bg: "#123456", ink: "#abcdef" },
        coverDesign: { ...DEFAULT_LAYOUT.coverDesign, bg1: "#000000" } as never,
      },
    };
    // Simulate the IndexedDB/backup round trip: serialize then parse.
    const roundTripped = JSON.parse(JSON.stringify(stored));
    const merged = withDefaults(blankDoc, roundTripped, DOC_OPTIONAL_KEYS);

    expect(merged.institute).toBe("Custom Institute");
    expect(merged.coverLines).toEqual(["Line one", "Line two"]);
    expect(merged.layout.coverColors).toEqual({ bg: "#123456", ink: "#abcdef" });
    expect((merged.layout.coverDesign as { bg1: string } | undefined)?.bg1).toBe("#000000");
  });

  it("LAYOUT_OPTIONAL_KEYS alone preserves coverColors/coverDesign on a direct layout merge", () => {
    const merged = withDefaults(DEFAULT_LAYOUT, { coverColors: { accent: "#fff" } }, LAYOUT_OPTIONAL_KEYS);
    expect(merged.coverColors).toEqual({ accent: "#fff" });
  });
});

describe("normalizeDoc — legacy template migration", () => {
  const legacyDoc = (template: string, answers: Doc["layout"]["answers"] = "end"): Doc =>
    ({
      id: "d",
      title: "T",
      subtitle: "",
      template,
      body: "Q. x?\nA) a\nB) b *",
      exam: "",
      paper: "",
      session: "",
      edition: "",
      author: "",
      lang: "en",
      layout: { ...DEFAULT_LAYOUT, answers },
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as Doc;

  it("migrates mcq to the Question Bank, keeping its stored answers mode", () => {
    const out = normalizeDoc(legacyDoc("mcq", "end"));
    expect(out.template).toBe("questions");
    expect(out.layout.answers).toBe("end"); // back-of-book key preserved
  });

  it("migrates pyq to the Question Bank with inline answers (solutions stay under each question)", () => {
    const out = normalizeDoc(legacyDoc("pyq", "end"));
    expect(out.template).toBe("questions");
    expect(out.layout.answers).toBe("inline");
  });

  it("migrates flashcards to Universal, leaving the body untouched", () => {
    const out = normalizeDoc(legacyDoc("flashcards"));
    expect(out.template).toBe("universal");
    expect(out.body).toBe("Q. x?\nA) a\nB) b *");
  });

  it("leaves current templates alone", () => {
    for (const t of ["notes", "questions", "revision", "universal"] as const) {
      expect(normalizeDoc(legacyDoc(t)).template).toBe(t);
    }
  });

  it("still maps retired cover styles alongside a template migration", () => {
    const doc = legacyDoc("mcq");
    doc.layout = { ...doc.layout, coverStyle: "midnight" as never };
    const out = normalizeDoc(doc);
    expect(out.template).toBe("questions");
    expect(out.layout.coverStyle).toBe("eclipse");
  });
});
