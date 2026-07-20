import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandConfig, Doc, Settings } from "../../lib/types";
import { buildDocumentHtml, pageFactKey } from "../../pdf/document";
import { toPortableMarkdown } from "../../lib/image";
import { downloadFile } from "../../lib/utils";
import { Button, IconButton, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";

/**
 * Publish — the export flow. Opens full screen, typesets the real pages
 * (Paged.js), lets the author review every page with zoom + page
 * navigation, then transcribes the exact typeset pages into a true
 * vector PDF and downloads it directly (no system print dialog). The
 * review pane and the PDF are the same document, so what you approve is
 * exactly what you download.
 */

export function buildFileTitle(doc: Doc, brand: BrandConfig, settings: Settings): string {
  const raw = settings.fileNamePattern
    .replace(/\{title\}/g, doc.title || "Untitled")
    .replace(/\{brand\}/g, brand.name)
    .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  return raw.replace(/[\\/:*?"<>|]/g, "·").trim() || "Untitled";
}

type Phase = "layout" | "ready" | "exporting" | "error";
type ZoomMode = "fit-width" | "fit-page" | "custom";

/** "1:23" / "0:07" — progress durations. */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Elapsed / remaining time for a long operation. `done`/`total` drive
    the ETA (cumulative-rate, so it stays smooth); a 1 s tick keeps the
    clock moving between progress events. `key` restarts the clock when
    the operation identity changes. */
function useOperationClock(active: boolean, key: string, done: number, total: number): { elapsed: number; etaMs: number | null } {
  const startRef = useRef(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, key]);
  if (!active) return { elapsed: 0, etaMs: null };
  const elapsed = Math.max(0, now - startRef.current);
  // An ETA from <3% progress or <2s of data is noise, not information.
  const etaMs = total > 0 && done > Math.max(2, total * 0.03) && elapsed > 2000
    ? (elapsed / done) * (total - done)
    : null;
  return { elapsed, etaMs };
}

const EXPORT_STAGE_LABEL: Record<string, string> = {
  prepare: "Preparing pages & fonts",
  pages: "Transcribing pages to vector PDF",
  assemble: "Compressing & saving PDF",
};

export function Publish({
  doc,
  brand,
  settings,
  estimatedPages,
  pagesExact,
  onPagesKnown,
  onClose,
}: {
  doc: Doc;
  brand: BrandConfig;
  settings: Settings;
  /** The workspace's current page count (authority chain) — drives the
      typesetting phase's progress bar and ETA before this overlay's own
      layout completes. */
  estimatedPages?: number;
  /** True when `estimatedPages` is an exact count carried over from a
      completed Pages-mode / Publish layout of this exact body + geometry:
      the typesetting bar can then trust the number and drop the "≈". */
  pagesExact?: boolean;
  /** Reports the completed layout so the editor's page readouts adopt
      the exact count (see Editor.tsx's page-count authority chain). */
  onPagesKnown?: (pages: number, body: string, factKey: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<Phase>("layout");
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [current, setCurrent] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [exportProg, setExportProg] = useState<{ done: number; total: number; stage: string }>({ done: 0, total: 0, stage: "prepare" });
  const [layoutPages, setLayoutPages] = useState(0);

  // Progress clocks — one per long-running phase.
  const layoutClock = useOperationClock(phase === "layout", "layout", layoutPages, estimatedPages ?? 0);
  const exportClock = useOperationClock(phase === "exporting", "export", exportProg.stage === "pages" ? exportProg.done : 0, exportProg.stage === "pages" ? exportProg.total : 0);

  const fileTitle = useMemo(() => buildFileTitle(doc, brand, settings), [doc, brand, settings]);
  // Snapshot at open — the overlay owns the screen, the doc can't change.
  const html = useMemo(
    () => buildDocumentHtml(doc, brand, { mode: "paged", purpose: "preview", fileTitle, theme: settings.docTheme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // An exact count carried over from Pages mode needs no "≈" prefix.
  const approx = pagesExact ? "" : "≈";

  const post = (message: unknown) => frameRef.current?.contentWindow?.postMessage(message, "*");

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (d?.type === "paged-done") {
        if (d.error || !d.pages) {
          setPhase("error");
          setError(String(d.error || "The page layout produced no pages."));
        } else {
          setPhase("ready");
          setPages(d.pages);
          onPagesKnown?.(d.pages, doc.body, pageFactKey(doc, brand, settings.docTheme));
        }
      } else if (d?.type === "paged-progress" && typeof d.pages === "number") {
        setLayoutPages(d.pages);
      } else if (d?.type === "page-visible") {
        setCurrent(d.page);
      } else if (d?.type === "zoom" && typeof d.zoom === "number") {
        setZoom(d.zoom);
        setZoomMode(d.mode === "fit-width" || d.mode === "fit-page" ? d.mode : "custom");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "exporting") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") goTo(current + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(current - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, phase, current, pages]);

  function setZoomModeCmd(next: ZoomMode | number) {
    post({ type: "set-zoom", zoom: next === "custom" ? zoom : next });
  }

  function goTo(page: number) {
    const p = Math.max(1, Math.min(pages, page));
    setCurrent(p);
    post({ type: "go-to-page", page: p });
  }

  async function downloadPdf() {
    const win = frameRef.current?.contentWindow;
    const srcDoc = win?.document;
    if (!srcDoc) return;
    setPhase("exporting");
    setExportProg({ done: 0, total: 0, stage: "prepare" });
    try {
      // The PDF engine (pdf-lib + fontkit) loads only on first export.
      const { exportPaginatedPdf } = await import("../../pdf/engine");
      const result = await exportPaginatedPdf(
        srcDoc,
        { title: fileTitle, author: doc.author || brand.author, subject: doc.subtitle, lang: doc.lang === "hi" ? "hi" : "en" },
        (done, total, stage) => setExportProg({ done, total, stage }),
      );
      downloadFile(`${fileTitle}.pdf`, result.blob, "application/pdf");
      toast(`Downloaded · ${result.pages} pages · ${(result.bytes / 1024).toFixed(0)} KB`, "ok");
      setPhase("ready");
    } catch (err) {
      console.error("[publish] export failed", err);
      toast("Export hit a problem — falling back to print.", "error");
      setPhase("ready");
      post({ type: "print" });
    }
  }

  function downloadMarkdown() {
    // Portable Markdown: embedded images (data URIs) are preserved in full,
    // but the Studio-only `{width=…}` figure attributes are stripped so the
    // file renders cleanly in any Markdown editor. Full-fidelity round-trip
    // (layout included) is the JSON backup's job, not the .md export's.
    downloadFile(`${fileTitle}.md`, toPortableMarkdown(doc.body), "text/markdown");
    toast("Downloaded · plain-text source, portable to any Markdown editor", "ok");
  }

  async function downloadHtml() {
    const srcDoc = frameRef.current?.contentWindow?.document;
    if (!srcDoc) return;
    try {
      const { buildStandaloneHtml } = await import("../../pdf/htmlExport");
      const html = await buildStandaloneHtml(srcDoc, fileTitle);
      downloadFile(`${fileTitle}.html`, html, "text/html");
      toast(`Downloaded · ${(new Blob([html]).size / 1024).toFixed(0)} KB · opens instantly in any browser`, "ok");
    } catch (err) {
      console.error("[publish] html export failed", err);
      toast("HTML export hit a problem.", "error");
    }
  }

  async function downloadFlowHtml() {
    try {
      const { buildFlowHtml } = await import("../../pdf/htmlExport");
      const flow = buildDocumentHtml(doc, brand, { mode: "flow", purpose: "export", fileTitle, theme: settings.docTheme });
      const html = await buildFlowHtml(flow, fileTitle);
      downloadFile(`${fileTitle} (web).html`, html, "text/html");
      toast(`Downloaded · ${(new Blob([html]).size / 1024).toFixed(0)} KB · continuous web layout, no pages`, "ok");
    } catch (err) {
      console.error("[publish] flow html export failed", err);
      toast("Web HTML export hit a problem.", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Publish PDF">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-edge bg-surface px-2.5 py-2 sm:px-4">
        <IconButton label="Back to editor" name="back" size={18} onClick={onClose} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-tight">{doc.title || "Untitled"}</h2>
          <p className="truncate text-xs tabular-nums text-faint">
            {phase === "layout"
              ? layoutPages > 0
                ? `Typesetting pages… ${layoutPages}${estimatedPages ? ` / ${approx}${estimatedPages}` : ""}`
                : "Typesetting pages…"
              : phase === "exporting"
                ? exportProg.stage === "pages" && exportProg.total
                  ? `Building vector PDF… ${exportProg.done} / ${exportProg.total} · ${Math.round((exportProg.done / exportProg.total) * 100)}%`
                  : EXPORT_STAGE_LABEL[exportProg.stage] ?? "Building vector PDF…"
                : phase === "ready"
                  ? `${pages} page${pages === 1 ? "" : "s"} · vector PDF, opens instantly`
                  : "Layout failed"}
          </p>
        </div>

        {phase !== "error" && phase !== "layout" && (
          <>
            <div className="hidden items-center gap-0.5 rounded-lg border border-edge p-0.5 sm:flex" role="group" aria-label="Zoom">
              <IconButton label="Zoom out" name="zoomOut" size={15} onClick={() => post({ type: "zoom-by", factor: 0.9 })} />
              <span className="min-w-11 text-center text-xs font-semibold tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
              <IconButton label="Zoom in" name="zoomIn" size={15} onClick={() => post({ type: "zoom-by", factor: 1.1 })} />
              <span className="mx-0.5 h-4 w-px bg-edge" />
              <IconButton label="Fit width" name="fitWidth" size={15} active={zoomMode === "fit-width"} onClick={() => setZoomModeCmd("fit-width")} />
              <IconButton label="Fit page" name="fitPage" size={15} active={zoomMode === "fit-page"} onClick={() => setZoomModeCmd("fit-page")} />
            </div>
            <div className="flex items-center gap-0.5" role="group" aria-label="Page navigation">
              <IconButton label="Previous page" name="chevronLeft" size={15} onClick={() => goTo(current - 1)} />
              <span className="min-w-14 text-center text-xs font-semibold tabular-nums text-ink-2">
                {current} / {pages}
              </span>
              <IconButton label="Next page" name="chevronRight" size={15} onClick={() => goTo(current + 1)} />
            </div>
          </>
        )}

        <IconButton
          label="Download Markdown — the raw source, portable to any Markdown editor or backup"
          name="file"
          size={17}
          onClick={downloadMarkdown}
        />
        {phase !== "error" && (
          <IconButton
            label="Download HTML — the same pages as an offline web page, opens instantly in any browser"
            name="globe"
            size={17}
            onClick={downloadHtml}
            disabled={phase !== "ready"}
          />
        )}
        <IconButton
          label="Download web-flow HTML — a pageless, continuous-scroll reading layout for websites and phones"
          name="monitor"
          size={17}
          onClick={() => void downloadFlowHtml()}
        />

        <Button
          variant="primary"
          icon={phase === "exporting" ? "loader" : "download"}
          onClick={downloadPdf}
          disabled={phase !== "ready"}
          className="px-2.5 sm:px-3"
        >
          <span className="hidden sm:inline">{phase === "exporting" ? "Exporting…" : "Download PDF"}</span>
          <span className="sm:hidden">PDF</span>
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <iframe
          ref={frameRef}
          title="Typeset pages"
          srcDoc={html}
          className="h-full w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-modals"
        />
        {phase === "layout" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/85 px-6">
            <Icon name="loader" size={22} className="animate-spin text-accent" />
            <div className="w-full max-w-sm text-center">
              <p className="text-sm font-semibold text-ink">Typesetting your pages</p>
              <p className="mt-1 text-sm tabular-nums text-ink-2">
                {layoutPages > 0 ? (
                  <>
                    Page {layoutPages}
                    {estimatedPages ? ` of ${approx}${estimatedPages} · ${approx}${Math.min(99, Math.round((layoutPages / estimatedPages) * 100))}%` : ""}
                  </>
                ) : (
                  "Preparing the layout engine…"
                )}
              </p>
              <p className="mt-1 text-xs tabular-nums text-faint">
                {fmtDur(layoutClock.elapsed)} elapsed
                {layoutClock.etaMs !== null ? ` · ≈${fmtDur(layoutClock.etaMs)} left` : ""}
              </p>
              {estimatedPages ? (
                <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${Math.min(99, (layoutPages / estimatedPages) * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
        {phase === "exporting" && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4">
            <div className="pointer-events-none w-full max-w-md rounded-xl border border-edge bg-surface/95 px-4 py-3 shadow-xl backdrop-blur">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-ink">{EXPORT_STAGE_LABEL[exportProg.stage] ?? "Exporting…"}</span>
                {exportProg.stage === "pages" && exportProg.total > 0 && (
                  <span className="text-xs tabular-nums text-ink-2">
                    {exportProg.done} / {exportProg.total} · {Math.round((exportProg.done / exportProg.total) * 100)}%
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${exportProg.total ? (exportProg.done / exportProg.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] tabular-nums text-faint">
                {fmtDur(exportClock.elapsed)} elapsed
                {exportClock.etaMs !== null ? ` · ≈${fmtDur(exportClock.etaMs)} left` : ""}
              </p>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
            <Icon name="alert" size={24} className="text-danger" />
            <p className="max-w-md text-sm text-ink-2">
              The page layout engine hit a problem{error ? ` (${error})` : ""}. You can still export a simplified
              continuous layout.
            </p>
            <div className="flex gap-2">
              <Button onClick={onClose}>Back to editor</Button>
              <Button variant="primary" icon="download" onClick={() => exportSimpleLayout(doc, brand, fileTitle, settings.docTheme)}>
                Export simple layout
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Last-resort export: prints the continuous flow layout (no page
    chrome) when pagination fails on very unusual content. */
function exportSimpleLayout(doc: Doc, brand: BrandConfig, fileTitle: string, theme: Settings["docTheme"]): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:900px;height:1200px;opacity:0;pointer-events:none;border:0;";
  frame.srcdoc = buildDocumentHtml(doc, brand, { mode: "flow", purpose: "export", fileTitle, theme });
  frame.addEventListener("load", () => {
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    }, 350);
  });
  document.body.appendChild(frame);
}
