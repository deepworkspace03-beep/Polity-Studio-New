import { describe, expect, it } from "vitest";
import { searchDocs } from "./search";
import type { Doc, DocLayout } from "./types";

const LAYOUT: DocLayout = {
  cover: true,
  coverStyle: "regal",
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
});
