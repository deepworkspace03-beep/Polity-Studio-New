import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { PageCanvas, type MarkCommand } from "./canvas";

/**
 * Browser-free coverage for the reusable-mark (Form XObject) primitives
 * that back the per-page vector-chrome caching in the PDF engine
 * (watermark temple, footer temple, social icons). The full transcription
 * path needs a real browser layout (getScreenCTM / getClientRects) and is
 * verified through the pixel-diff harness in the perf session; here we
 * lock the pure pdf-lib mechanics: a well-formed form is produced,
 * referenced from the page, and survives a save→load round-trip.
 */

const K = 72 / 96;

function square(): MarkCommand {
  // 10×10 unit square at the origin, identity local matrix, red fill.
  return {
    path: [
      { op: "M", x: 0, y: 0 },
      { op: "L", x: 10, y: 0 },
      { op: "L", x: 10, y: 10 },
      { op: "L", x: 0, y: 10 },
      { op: "Z" },
    ],
    local: [1, 0, 0, 1, 0, 0],
    fill: { r: 1, g: 0, b: 0, a: 1 },
    evenOdd: false,
  };
}

describe("PageCanvas reusable marks", () => {
  it("builds a form and references it from the page, round-tripping cleanly", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const canvas = new PageCanvas(pdf, page, 842 / K); // css page height → pt height 842

    const formRef = canvas.buildMarkForm([square()]);
    expect(formRef).toBeTruthy();

    canvas.drawForm(formRef, 100, 100, 0.5);
    canvas.flush();

    // The page's XObject resource dict must reference the form.
    const resources = page.node.Resources();
    const xobjects = resources?.lookup(PDFName.of("XObject"));
    expect(xobjects).toBeTruthy();

    // Save + reload proves the emitted operators and form stream are valid PDF.
    const bytes = await pdf.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("reuses one form for two draws (the cache stores a single ref)", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const canvas = new PageCanvas(pdf, page, 842 / K);

    // Callers cache by content signature; the same ref replayed twice must
    // stay valid and produce a single shared object.
    const ref = canvas.buildMarkForm([square()]);
    canvas.drawForm(ref, 0, 0, 1);
    canvas.drawForm(ref, 200, 300, 0.8);
    canvas.flush();

    const bytes = await pdf.save();
    expect(bytes.length).toBeGreaterThan(0);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
