import type { BrandConfig, Doc, Settings } from "../lib/types";
import { buildDocumentHtml } from "./document";

/**
 * PDF export — paginates the document with Paged.js inside a hidden
 * same-origin iframe, then opens the browser's print dialog on that
 * frame ("Save as PDF"). No popup windows, so tablet popup blockers
 * never interfere; the iframe document title becomes the suggested
 * PDF filename.
 */

export type ExportPhase = "paginating" | "printing";

export interface ExportResult {
  pages: number;
  /** True when pagination failed and the simple (non-paged) layout was printed. */
  fallback: boolean;
}

export function buildFileTitle(doc: Doc, brand: BrandConfig, settings: Settings): string {
  const raw = settings.fileNamePattern
    .replace(/\{title\}/g, doc.title || "Untitled")
    .replace(/\{brand\}/g, brand.name)
    .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  return raw.replace(/[\\/:*?"<>|]/g, "·").trim() || "Untitled";
}

let activeFrame: HTMLIFrameElement | null = null;

function removeActiveFrame(): void {
  activeFrame?.remove();
  activeFrame = null;
}

function mountFrame(html: string): HTMLIFrameElement {
  removeActiveFrame();
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Rendered (not display:none) so Paged.js can measure layout, but
  // invisible and out of the way.
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1080px;height:1400px;opacity:0;pointer-events:none;border:0;";
  frame.srcdoc = html;
  document.body.appendChild(frame);
  activeFrame = frame;
  return frame;
}

function waitForPagination(frame: HTMLIFrameElement, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = window.setInterval(() => {
      const win = frame.contentWindow as (Window & { __PAGED_DONE__?: boolean; __PAGED_PAGES__?: number; __PAGED_ERROR__?: string }) | null;
      if (win?.__PAGED_DONE__) {
        window.clearInterval(poll);
        if (win.__PAGED_ERROR__ || !win.__PAGED_PAGES__) reject(new Error(win.__PAGED_ERROR__ || "Pagination produced no pages"));
        else resolve(win.__PAGED_PAGES__);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(poll);
        reject(new Error("Pagination timed out"));
      }
    }, 150);
  });
}

function printFrame(frame: HTMLIFrameElement): void {
  const win = frame.contentWindow;
  if (!win) throw new Error("Print frame is gone");
  // Keep the frame alive until the print dialog closes, then clean up.
  const cleanup = () => {
    if (activeFrame === frame) removeActiveFrame();
  };
  win.addEventListener("afterprint", () => setTimeout(cleanup, 500));
  setTimeout(cleanup, 10 * 60 * 1000); // safety net if afterprint never fires
  win.focus();
  win.print();
}

export async function exportPdf(
  doc: Doc,
  brand: BrandConfig,
  settings: Settings,
  onPhase?: (phase: ExportPhase) => void,
): Promise<ExportResult> {
  const fileTitle = buildFileTitle(doc, brand, settings);

  onPhase?.("paginating");
  const frame = mountFrame(buildDocumentHtml(doc, brand, { mode: "paged", purpose: "export", fileTitle }));
  try {
    const pages = await waitForPagination(frame, 5 * 60 * 1000);
    onPhase?.("printing");
    printFrame(frame);
    return { pages, fallback: false };
  } catch (err) {
    console.warn("[export] pagination failed — printing simple layout", err);
    const fallbackFrame = mountFrame(buildDocumentHtml(doc, brand, { mode: "flow", purpose: "export", fileTitle }));
    await new Promise<void>((resolve) => {
      fallbackFrame.addEventListener("load", () => resolve(), { once: true });
      setTimeout(resolve, 4000);
    });
    onPhase?.("printing");
    printFrame(fallbackFrame);
    return { pages: 0, fallback: true };
  }
}
