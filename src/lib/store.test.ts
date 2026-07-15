import { describe, expect, it } from "vitest";
import { DOC_OPTIONAL_KEYS, LAYOUT_OPTIONAL_KEYS, withDefaults } from "./store";
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
