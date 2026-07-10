import { useEffect, useRef, useState } from "react";
import type { BrandConfig, Doc } from "../../lib/types";
import { buildDocContent, buildDocumentHtml, buildShellKey } from "../../pdf/document";
import { IconButton, Segmented } from "../../components/ui";

type PreviewMode = "flow" | "pages";
type ZoomMode = "fit-width" | "fit-page" | "custom";

export type InlineEdit = { field: string; text: string } | { line: number; text: string };

const FLOW_DEBOUNCE = 200;
const PAGED_DEBOUNCE = 1200;
const CURSOR_DEBOUNCE = 120;

/**
 * Live preview — the central workspace.
 *
 * Flow — the iframe shell (fonts, styles, scripts) loads once; edits
 * swap only the rendered content in place, so the preview never flashes
 * or loses scroll position. Titles, subtitles and headings are editable
 * inline (contenteditable) and stream straight back to the document.
 *
 * Pages — the real Paged.js pipeline: exact printed pages with running
 * headers, page numbers and watermark, plus fit/zoom/pinch and reliable
 * page navigation for desktop through tablet.
 */
export function Preview({
  doc,
  brand,
  cursorLine,
  onInlineEdit,
  fullscreen,
  onToggleFullscreen,
}: {
  doc: Doc;
  brand: BrandConfig;
  cursorLine: number;
  onInlineEdit: (edit: InlineEdit) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [mode, setMode] = useState<PreviewMode>("flow");
  const [srcDoc, setSrcDoc] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [current, setCurrent] = useState(1);
  const [paginating, setPaginating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const editingRef = useRef(false);
  const shellKeyRef = useRef("");
  const cursorRef = useRef(cursorLine);
  cursorRef.current = cursorLine;
  const onEditRef = useRef(onInlineEdit);
  onEditRef.current = onInlineEdit;

  const post = (message: unknown) => frameRef.current?.contentWindow?.postMessage(message, "*");

  // Content pipeline — full shell rebuild only when the shell itself
  // (fonts, page geometry, template CSS, mode) changes.
  useEffect(() => {
    const shellKey = `${mode}|${buildShellKey(doc, brand)}`;
    const rebuild = shellKey !== shellKeyRef.current || !readyRef.current;
    if (mode === "pages") {
      setPaginating(true);
      setPages(null);
    }
    const timer = setTimeout(
      () => {
        if (mode === "pages") {
          shellKeyRef.current = shellKey;
          readyRef.current = false;
          setSrcDoc(buildDocumentHtml(doc, brand, { mode: "paged", purpose: "preview" }));
        } else if (rebuild) {
          shellKeyRef.current = shellKey;
          readyRef.current = false;
          setSrcDoc(buildDocumentHtml(doc, brand, { mode: "flow", purpose: "preview" }));
        } else if (!editingRef.current) {
          post({ type: "update", html: buildDocContent(doc, brand) });
        }
      },
      mode === "pages" ? PAGED_DEBOUNCE : rebuild ? 0 : FLOW_DEBOUNCE,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, brand, mode]);

  // Cursor follows the editor into the preview.
  useEffect(() => {
    if (!readyRef.current || cursorLine <= 0) return;
    const timer = setTimeout(() => post({ type: "scroll-to-line", line: cursorLine }), CURSOR_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [cursorLine]);

  // Frame → host messages.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === "preview-ready") {
        readyRef.current = true;
        if (cursorRef.current > 1) post({ type: "scroll-to-line", line: cursorRef.current });
      } else if (d.type === "paged-done") {
        readyRef.current = true;
        setPaginating(false);
        setPages(typeof d.pages === "number" && d.pages > 0 ? d.pages : null);
        if (cursorRef.current > 1) post({ type: "scroll-to-line", line: cursorRef.current });
      } else if (d.type === "page-visible") {
        setCurrent(d.page);
      } else if (d.type === "zoom" && typeof d.zoom === "number") {
        setZoom(d.zoom);
        setZoomMode(d.mode === "fit-width" || d.mode === "fit-page" ? d.mode : "custom");
      } else if (d.type === "edit-focus") {
        editingRef.current = true;
      } else if (d.type === "edit-blur") {
        editingRef.current = false;
      } else if (d.type === "inline-edit") {
        if (typeof d.line === "number") onEditRef.current({ line: d.line, text: d.text });
        else if (typeof d.field === "string") onEditRef.current({ field: d.field, text: d.text });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function goTo(page: number) {
    if (!pages) return;
    const p = Math.max(1, Math.min(pages, page));
    setCurrent(p);
    post({ type: "go-to-page", page: p });
  }

  const isPages = mode === "pages";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-edge bg-surface px-2 py-1.5">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "flow", label: "Flow" },
            { value: "pages", label: "Pages" },
          ]}
        />

        {isPages && pages ? (
          <>
            <div className="hidden items-center gap-0.5 rounded-lg border border-edge p-0.5 md:flex" role="group" aria-label="Zoom">
              <IconButton label="Zoom out" name="zoomOut" size={14} onClick={() => post({ type: "zoom-by", factor: 0.9 })} />
              <span className="min-w-10 text-center text-[11px] font-semibold tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
              <IconButton label="Zoom in" name="zoomIn" size={14} onClick={() => post({ type: "zoom-by", factor: 1.1 })} />
              <span className="mx-0.5 h-4 w-px bg-edge" />
              <IconButton label="Fit width" name="fitWidth" size={14} active={zoomMode === "fit-width"} onClick={() => post({ type: "set-zoom", zoom: "fit-width" })} />
              <IconButton label="Fit page" name="fitPage" size={14} active={zoomMode === "fit-page"} onClick={() => post({ type: "set-zoom", zoom: "fit-page" })} />
            </div>
            <div className="flex items-center gap-0.5" role="group" aria-label="Page navigation">
              <IconButton label="Previous page" name="chevronLeft" size={14} onClick={() => goTo(current - 1)} />
              <span className="min-w-12 text-center text-[11px] font-semibold tabular-nums text-ink-2">{current} / {pages}</span>
              <IconButton label="Next page" name="chevronRight" size={14} onClick={() => goTo(current + 1)} />
            </div>
          </>
        ) : (
          <span className="text-xs text-faint" aria-live="polite">
            {isPages ? (paginating ? "Laying out pages…" : "") : "Live preview · tap a title to edit"}
          </span>
        )}

        <IconButton
          label={fullscreen ? "Exit full screen" : "Full screen"}
          name={fullscreen ? "collapse" : "expand"}
          size={15}
          className="ml-auto"
          active={fullscreen}
          onClick={onToggleFullscreen}
        />
      </div>
      <iframe
        ref={frameRef}
        title="Document preview"
        srcDoc={srcDoc}
        className="h-full w-full flex-1 border-0 bg-white"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  );
}
