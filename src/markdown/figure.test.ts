import { describe, expect, it } from "vitest";
import { DEFAULT_FIGURE_ATTRS, figureClass, parseFigureAttrs, serializeFigureAttrs } from "./figure";

describe("figure attributes", () => {
  it("parses legacy width/align/fit unchanged", () => {
    const a = parseFigureAttrs("width=60% align=left fit=cover");
    expect(a.width).toBe("60%");
    expect(a.align).toBe("left");
    expect(a.cover).toBe(true);
  });

  it("adds a unit to a bare numeric width and rejects junk", () => {
    expect(parseFigureAttrs("width=220").width).toBe("220px");
    expect(parseFigureAttrs("width=oops").width).toBe("");
  });

  it("reads bare boolean flags and their explicit off form", () => {
    const on = parseFigureAttrs("border round shadow");
    expect(on.border && on.round && on.shadow).toBe(true);
    const off = parseFigureAttrs("border=0 round=off");
    expect(off.border).toBe(false);
    expect(off.round).toBe(false);
  });

  it("accepts the new full alignment and gap sizes", () => {
    expect(parseFigureAttrs("align=full").align).toBe("full");
    expect(parseFigureAttrs("gap=lg").gap).toBe("lg");
    expect(parseFigureAttrs("gap=nonsense").gap).toBe("");
  });

  it("round-trips through serialize → parse", () => {
    const a = parseFigureAttrs("width=35% align=right gap=sm border shadow");
    expect(parseFigureAttrs(serializeFigureAttrs(a))).toEqual(a);
  });

  it("serializes a default figure to nothing", () => {
    expect(serializeFigureAttrs(DEFAULT_FIGURE_ATTRS)).toBe("");
  });

  it("builds the expected class list", () => {
    const a = parseFigureAttrs("align=left border round gap=lg");
    const cls = figureClass(a);
    expect(cls).toContain("md-figure--left");
    expect(cls).toContain("md-fig--border");
    expect(cls).toContain("md-fig--round");
    expect(cls).toContain("md-fig--gap-lg");
  });
});
