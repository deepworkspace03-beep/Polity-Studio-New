import { describe, expect, it } from "vitest";
import { TEMPLE_PATH, templeMarkSvg, templeEmblemSvg } from "./marks";

describe("temple mark", () => {
  // The emblem is cloned into every page's footer and watermark, so its
  // node count is a per-page cost on large documents. It must stay a single
  // compound <path> (roof + rounded-rect subpaths), not path + five rects.
  it("is a single compound path node", () => {
    expect((TEMPLE_PATH.match(/<path/g) || []).length).toBe(1);
    expect(TEMPLE_PATH).not.toContain("<rect");
    expect(TEMPLE_PATH).not.toContain("<circle");
  });

  it("keeps the roof-triangle geometry (unchanged from the split form)", () => {
    expect(TEMPLE_PATH).toContain("M 20 40 L 50 26 L 80 40 Z");
  });

  it("wraps the same path in every sizing helper (footer, watermark, cover)", () => {
    expect(templeMarkSvg("15pt", "run-foot-brand__mark")).toContain(TEMPLE_PATH);
    expect(templeMarkSvg("34pt", "page-watermark__mark")).toContain(TEMPLE_PATH);
    expect(templeEmblemSvg("cv-emblem")).toContain(TEMPLE_PATH);
  });
});
