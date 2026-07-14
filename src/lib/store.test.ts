import { describe, expect, it } from "vitest";
import { DOC_OPTIONAL_KEYS, LAYOUT_OPTIONAL_KEYS, normalizeDoc, withDefaults } from "./store";
import { DEFAULT_LAYOUT } from "../brand/defaults";
import type { Doc } from "./types";

function migrationDoc(template: string, layoutPatch: Partial<Doc["layout"]> = {}): Doc {
  return {
    id: "d",
    title: "T",
    subtitle: "",
    template: template as Doc["template"],
    body: "",
    exam: "",
    paper: "",
    session: "",
    author: "",
    lang: "en",
    layout: { ...DEFAULT_LAYOUT, ...layoutPatch },
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Regression coverage for the schema-merge safety net (see the comment
 * above `withDefaults` in store.ts): a stored field that is legitimately
 * optional (institute, coverLines, edition, coverColors, coverDesign) must
 * survive a load/restore even though it's absent from the in-code defaults
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

  it("round-trips every Doc.institute/coverLines/edition and DocLayout.coverColors/coverDesign field through JSON without loss", () => {
    const blankDoc: Doc = {
      id: "doc-1",
      title: "Untitled",
      subtitle: "",
      template: "notes",
      body: "",
      exam: "",
      paper: "",
      session: "",
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
      edition: "2nd Edition",
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
    expect(merged.edition).toBe("2nd Edition");
    expect(merged.layout.coverColors).toEqual({ bg: "#123456", ink: "#abcdef" });
    expect((merged.layout.coverDesign as { bg1: string } | undefined)?.bg1).toBe("#000000");
  });

  it("LAYOUT_OPTIONAL_KEYS alone preserves coverColors/coverDesign on a direct layout merge", () => {
    const merged = withDefaults(DEFAULT_LAYOUT, { coverColors: { accent: "#fff" } }, LAYOUT_OPTIONAL_KEYS);
    expect(merged.coverColors).toEqual({ accent: "#fff" });
  });
});

/**
 * Regression coverage for the five-templates-to-four migration
 * (normalizeDoc's LEGACY_TEMPLATES/LEGACY_TEMPLATE_LAYOUT): a document
 * stored under a retired template id must load as the template that
 * absorbed it, with the layout override that reproduces its old fixed
 * behavior — otherwise a real MCQ/PYQ/Flashcards document a user already
 * saved would silently misrender after this upgrade.
 */
describe("normalizeDoc — legacy template migration", () => {
  it("migrates mcq to question-bank, keeping the document's existing answers mode", () => {
    const doc = normalizeDoc(migrationDoc("mcq", { answers: "end" }));
    expect(doc.template).toBe("question-bank");
    expect(doc.layout.answers).toBe("end");
  });

  it("migrates pyq to question-bank and forces answers to inline (its old fixed behavior)", () => {
    const doc = normalizeDoc(migrationDoc("pyq", { answers: "end" }));
    expect(doc.template).toBe("question-bank");
    expect(doc.layout.answers).toBe("inline");
  });

  it("migrates flashcards to revision and sets revisionStyle to cards", () => {
    const doc = normalizeDoc(migrationDoc("flashcards", { revisionStyle: "notes" }));
    expect(doc.template).toBe("revision");
    expect(doc.layout.revisionStyle).toBe("cards");
  });

  it("leaves current templates (notes, question-bank, revision, universal) untouched", () => {
    for (const template of ["notes", "question-bank", "revision", "universal"]) {
      const doc = normalizeDoc(migrationDoc(template));
      expect(doc.template).toBe(template);
    }
  });
});
