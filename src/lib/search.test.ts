import { describe, expect, it } from "vitest";
import { documentBreakdown, searchDocs } from "./search";
import type { Doc, DocLayout } from "./types";

const LAYOUT: DocLayout = {
  cover: true,
  coverStyle: "meridian",
  toc: true,
  watermark: true,
  pageSize: "a4",
  density: "comfort",
  answers: "end",
};

function doc(partial: Partial<Doc> & { id: string }): Doc {
  return {
    title: "",
    subtitle: "",
    template: "notes",
    body: "",
    exam: "",
    paper: "",
    session: "",
    edition: "",
    author: "",
    lang: "en",
    layout: LAYOUT,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("searchDocs", () => {
  it("matches by title with a higher score than a body match", () => {
    const docs = [
      doc({ id: "a", title: "Sovereignty in India", updatedAt: 1 }),
      doc({ id: "b", title: "Untitled", body: "A long discussion of sovereignty appears here.", updatedAt: 2 }),
    ];
    const hits = searchDocs(docs, "sovereignty");
    expect(hits[0].doc.id).toBe("a");
  });

  it("requires every query token to match somewhere (AND semantics)", () => {
    const docs = [doc({ id: "a", title: "Federalism", body: "notes about the constitution" })];
    expect(searchDocs(docs, "federalism nonexistentword")).toHaveLength(0);
    expect(searchDocs(docs, "federalism constitution")).toHaveLength(1);
  });

  it("attaches a snippet and line number only for body matches", () => {
    const docs = [doc({ id: "a", title: "Rights", body: "line one\nline two mentions liberty here\nline three" })];
    const hits = searchDocs(docs, "liberty");
    expect(hits[0].line).toBe(2);
    expect(hits[0].snippet).toContain("liberty");
  });

  it("does not set a line/snippet for a title-only match", () => {
    const docs = [doc({ id: "a", title: "Liberty", body: "unrelated content" })];
    const hits = searchDocs(docs, "liberty");
    expect(hits[0].line).toBeUndefined();
  });

  it("sorts by score, then by most-recently-updated", () => {
    const docs = [
      doc({ id: "old", title: "Notes", body: "topic mention", updatedAt: 1 }),
      doc({ id: "new", title: "Notes", body: "topic mention", updatedAt: 2 }),
    ];
    const hits = searchDocs(docs, "topic");
    expect(hits[0].doc.id).toBe("new");
  });

  it("returns nothing for an empty query", () => {
    expect(searchDocs([doc({ id: "a", title: "x" })], "   ")).toHaveLength(0);
  });

  it("counts occurrences across every field and records where they fall", () => {
    const docs = [
      doc({ id: "a", title: "Justice", exam: "justice paper", body: "justice is fair. justice matters." }),
    ];
    const [hit] = searchDocs(docs, "justice");
    // 1 in title + 1 in meta (exam) + 2 in body.
    expect(hit.matchCount).toBe(4);
    expect(hit.where).toEqual({ title: 1, meta: 1, body: 2 });
  });
});

describe("documentBreakdown", () => {
  it("groups body occurrences under their heading section with a jump line", () => {
    const body = ["# Intro", "freedom of speech", "", "# Rights", "freedom again", "freedom thrice"].join("\n");
    const bd = documentBreakdown(doc({ id: "a", body }), "freedom", 10);
    expect(bd.total).toBe(3);
    expect(bd.sections).toHaveLength(2);
    expect(bd.sections[0].title).toBe("Intro");
    expect(bd.sections[0].count).toBe(1);
    expect(bd.sections[0].matchLine).toBe(2); // 1-based source line of the first hit
    expect(bd.sections[1].title).toBe("Rights");
    expect(bd.sections[1].count).toBe(2);
  });

  it("is empty for a query that never appears in the body", () => {
    const bd = documentBreakdown(doc({ id: "a", body: "nothing relevant" }), "absent", 5);
    expect(bd.total).toBe(0);
    expect(bd.sections).toHaveLength(0);
  });
});
