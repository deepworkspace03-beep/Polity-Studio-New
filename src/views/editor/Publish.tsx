import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandConfig, Doc, Settings } from "../../lib/types";
import { buildDocumentHtml } from "../../pdf/document";
import { Button, IconButton, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";

/**
 * Publish — the export flow. Opens full screen, immediately typesets
 * the real pages (Paged.js), lets the author review every page with
 * zoom + page navigation, then hands the typeset document to the
 * browser's PDF engine ("Save as PDF"). The review pane and the PDF are
 * the same document, so what you approve is exactly what you download.
 */

export function buildFileTitle(doc: Doc, brand: BrandConfig, settings: Settings): string {
  const raw = settings.fileNamePattern
    .replace(/\{title\}/g, doc.title || "Untitled")
    .replace(/\{brand\}/g, brand.name)
    .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
  return raw.replace(/[\\/:*?"<>|]/g, "·").trim() || "Untitled";
}

type Phase = "layout" | "ready" | "error";

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.2, 1.5, 2];

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
  const [zoom, setZoom] = useState<number>(1);
  const [fit, setFit] = useState(true);

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
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setZoomMode(next: number | "fit") {
    if (next === "fit") {
      setFit(true);
      post({ type: "set-zoom", zoom: "fit" });
    } else {
      setFit(false);
      setZoom(next);
      post({ type: "set-zoom", zoom: next });
    }
  }

  function zoomBy(dir: 1 | -1) {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.01);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (idx < 0 ? 3 : idx) + dir))];
    setZoomMode(next);
  }

  function goTo(page: number) {
    const p = Math.max(1, Math.min(pages, page));
    setCurrent(p);
    post({ type: "go-to-page", page: p });
  }

  function downloadPdf() {
    post({ type: "print" });
    toast("Choose “Save as PDF” to download your document.", "info");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Publish PDF">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-edge bg-surface px-2.5 py-2 sm:px-4">
        <IconButton label="Back to editor" name="back" size={18} onClick={onClose} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold leading-tight">{doc.title || "Untitled"}</h2>
          <p className="truncate text-xs text-faint">
            {phase === "layout" ? "Typesetting pages…" : phase === "ready" ? `${pages} page${pages === 1 ? "" : "s"} · ready to download` : "Layout failed"}
          </p>
        </div>

        {phase === "ready" && (
          <>
            <div className="hidden items-center gap-0.5 sm:flex" role="group" aria-label="Zoom">
              <IconButton label="Zoom out" name="zoomOut" size={15} onClick={() => zoomBy(-1)} />
              <IconButton label="Fit to width" name="fitWidth" size={15} active={fit} onClick={() => setZoomMode("fit")} />
              <IconButton label="Zoom in" name="zoomIn" size={15} onClick={() => zoomBy(1)} />
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

        <Button variant="primary" icon="download" onClick={downloadPdf} disabled={phase !== "ready"} className="px-2.5 sm:px-3">
          <span className="hidden sm:inline">Download PDF</span>
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
