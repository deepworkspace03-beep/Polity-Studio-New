import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandConfig, Doc, Settings } from "../../lib/types";
import { buildDocumentHtml } from "../../pdf/document";
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

export function Publish({
  doc,
  brand,
  settings,
  onClose,
}: {
  doc: Doc;
  brand: BrandConfig;
  settings: Settings;
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
  const [progress, setProgress] = useState(0);

  const fileTitle = useMemo(() => buildFileTitle(doc, brand, settings), [doc, brand, settings]);
  // Snapshot at open — the overlay owns the screen, the doc can't change.
  const html = useMemo(
    () => buildDocumentHtml(doc, brand, { mode: "paged", purpose: "preview", fileTitle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
        }
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
    setProgress(0);
    try {
      // The PDF engine (pdf-lib + fontkit) loads only on first export.
      const { exportPaginatedPdf } = await import("../../pdf/engine");
      const result = await exportPaginatedPdf(
        srcDoc,
        { title: fileTitle, author: doc.author || brand.author, subject: doc.subtitle, lang: doc.lang },
        (done, total) => setProgress(total ? done / total : 0),
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Publish PDF">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-edge bg-surface px-2.5 py-2 sm:px-4">
        <IconButton label="Back to editor" name="back" size={18} onClick={onClose} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-tight">{doc.title || "Untitled"}</h2>
          <p className="truncate text-xs text-faint">
            {phase === "layout"
              ? "Typesetting pages…"
              : phase === "exporting"
                ? `Building vector PDF… ${Math.round(progress * 100)}%`
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/85">
            <Icon name="loader" size={22} className="animate-spin text-accent" />
            <p className="text-sm text-ink-2">Typesetting your pages…</p>
          </div>
        )}
        {phase === "exporting" && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-edge">
            <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
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
              <Button variant="primary" icon="download" onClick={() => exportSimpleLayout(doc, brand, fileTitle)}>
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
function exportSimpleLayout(doc: Doc, brand: BrandConfig, fileTitle: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:900px;height:1200px;opacity:0;pointer-events:none;border:0;";
  frame.srcdoc = buildDocumentHtml(doc, brand, { mode: "flow", purpose: "export", fileTitle });
  frame.addEventListener("load", () => {
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    }, 350);
  });
  document.body.appendChild(frame);
}
