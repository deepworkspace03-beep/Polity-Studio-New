import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { BrandConfig, Doc, DocTheme } from "../../lib/types";
import { buildDocContent, buildDocumentHtml, buildShellKey, pageFactKey } from "../../pdf/document";
import { saveSettings } from "../../lib/store";
import { IconButton, Segmented, useToast } from "../../components/ui";
import { imageFileToDataUrl } from "../../lib/image";
import { parseImageLine, patchImageLine, removeImageLine } from "./imageLine";
import { ImageEditControls } from "./ImageEditControls";
import { ScrollJump } from "./ScrollJump";

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
  theme,
  cursorLine,
  estimatedPages,
  pagesExact,
  onPagesKnown,
  onInlineEdit,
  onFocusLine,
  fullscreen,
  onToggleFullscreen,
  onCollapse,
  getView,
  scrollSyncRef,
  coverPeekRef,
}: {
  doc: Doc;
  brand: BrandConfig;
  /** Reading theme for the rendered document (Settings → Appearance). */
  theme: DocTheme;
  cursorLine: number;
  /** Total pages for the flow view's navigation readout — exact when a
      real pagination has run for this content, else the estimate. */
  estimatedPages?: number;
  pagesExact?: boolean;
  /** Reports every completed Paged.js layout (pages + the body/geometry
      it was laid out for) so the host can make it the workspace-wide
      authoritative page count. */
  onPagesKnown?: (pages: number, body: string, factKey: string) => void;
  onInlineEdit: (edit: InlineEdit) => void;
  /** Preview → editor: the reader clicked a sourced element. `focusEditor`
      is false for elements that are themselves inline-editable (moving
      DOM focus to CodeMirror would blur the contenteditable mid-click). */
  onFocusLine: (line: number, focusEditor: boolean) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Tucks the preview pane away to a slim rail (desktop/tablet three-pane layout only). */
  onCollapse?: () => void;
  /** Same CodeMirror view accessor the toolbar uses — lets a clicked
      image in the Flow preview be edited (resize/align/caption/replace/
      remove) in place, by patching the same Markdown source line. */
  getView?: () => EditorView | null;
  /** The host stores a "scroll the preview to this 0–1 position" function
      here so editor scrolling can drive the preview to the same spot
      without re-rendering this component on every frame. */
  scrollSyncRef?: React.MutableRefObject<((pct: number) => void) | null>;
  /** Cover peek — the host stores a function here that the settings pane
      calls with true while a cover/publication field has focus: the
      preview shows the cover, then returns to where the reader was. */
  coverPeekRef?: React.MutableRefObject<((active: boolean) => void) | null>;
}) {
  const [mode, setMode] = useState<PreviewMode>("flow");
  const [srcDoc, setSrcDoc] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [current, setCurrent] = useState(1);
  const [flowPct, setFlowPct] = useState(0);
  const [paginating, setPaginating] = useState(false);
  const [layoutPages, setLayoutPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [selectedImageLine, setSelectedImageLine] = useState<number | null>(null);
  const toast = useToast();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const lastContentRef = useRef("");
  const editingRef = useRef(false);
  const shellKeyRef = useRef("");
  const cursorRef = useRef(cursorLine);
  cursorRef.current = cursorLine;
  const onEditRef = useRef(onInlineEdit);
  onEditRef.current = onInlineEdit;
  const onFocusLineRef = useRef(onFocusLine);
  onFocusLineRef.current = onFocusLine;
  const onPagesKnownRef = useRef(onPagesKnown);
  onPagesKnownRef.current = onPagesKnown;
  // Snapshot of what the current paged srcDoc was built from, so a
  // paged-done can be attributed to exactly that body + geometry even if
  // the reader kept typing while Paged.js was laying out.
  const builtForRef = useRef<{ body: string; factKey: string } | null>(null);
  // The zoom the reader last chose — reapplied after every repagination
  // rebuild, which otherwise silently reset it back to fit-width.
  const zoomCmdRef = useRef<ZoomMode | number | null>(null);
  // Snapshot of zoomCmdRef taken right before a rebuild, consumed once on
  // that rebuild's paged-done. A fresh iframe announces its own default
  // zoom before paged-done fires, which would clobber zoomCmdRef itself —
  // this frozen copy survives that.
  const pendingZoomRestoreRef = useRef<ZoomMode | number | null>(null);
  // Cover peek — while a cover/publication field is focused the preview
  // parks on the cover; the position the reader was at is restored when
  // focus moves on. Refs, not state: peeking must never re-render.
  const peekingRef = useRef(false);
  const peekReturnRef = useRef<number | null>(null); // flow pct or page number

  const post = (message: unknown) => frameRef.current?.contentWindow?.postMessage(message, "*");

  // Cover peek — (re)assigned every render so the closure always sees the
  // live mode and position (the same pattern as the refs above).
  if (coverPeekRef) {
    coverPeekRef.current = (active: boolean) => {
      if (active === peekingRef.current) return;
      peekingRef.current = active;
      if (active) {
        peekReturnRef.current = mode === "pages" ? current : flowPct;
        post(mode === "pages" ? { type: "go-to-page", page: 1 } : { type: "scroll-to-pct", pct: 0 });
      } else {
        const back = peekReturnRef.current;
        peekReturnRef.current = null;
        if (back == null) return;
        post(mode === "pages" ? { type: "go-to-page", page: Math.max(1, Math.round(back)) } : { type: "scroll-to-pct", pct: back });
      }
    };
  }

  // Content pipeline — full shell rebuild only when the shell itself
  // (fonts, page geometry, template CSS, mode) changes.
  useEffect(() => {
    const shellKey = `${mode}|${buildShellKey(doc, brand, theme)}`;
    const rebuild = shellKey !== shellKeyRef.current || !readyRef.current;
    if (mode === "pages") {
      setPaginating(true);
      setPages(null);
      setLayoutPages(0);
    }
    // Adaptive debounce: very large documents render and (especially)
    // paginate slower, so give typing a longer quiet window before the
    // expensive work starts — the editor itself never blocks.
    const size = doc.body.length;
    const flowDelay = Math.min(1200, FLOW_DEBOUNCE + size / 2500);
    const pagedDelay = Math.min(5000, PAGED_DEBOUNCE + size / 400);
    const timer = setTimeout(
      () => {
        if (mode === "pages") {
          shellKeyRef.current = shellKey;
          readyRef.current = false;
          pendingZoomRestoreRef.current = zoomCmdRef.current;
          builtForRef.current = { body: doc.body, factKey: pageFactKey(doc, brand, theme) };
          setSrcDoc(buildDocumentHtml(doc, brand, { mode: "paged", purpose: "preview", theme }));
        } else if (rebuild) {
          shellKeyRef.current = shellKey;
          readyRef.current = false;
          lastContentRef.current = "";
          setSrcDoc(buildDocumentHtml(doc, brand, { mode: "flow", purpose: "preview", theme }));
        } else if (!editingRef.current) {
          const html = buildDocContent(doc, brand);
          // Skip the innerHTML swap (and the layout it forces) when the
          // rendered content didn't actually change.
          if (html !== lastContentRef.current) {
            lastContentRef.current = html;
            post({ type: "update", html });
          }
        }
      },
      mode === "pages" ? pagedDelay : rebuild ? 0 : flowDelay,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, brand, mode, theme]);

  // Cursor follows the editor into the preview (paused during cover peek).
  useEffect(() => {
    if (!readyRef.current || cursorLine <= 0 || peekingRef.current) return;
    const timer = setTimeout(() => post({ type: "scroll-to-line", line: cursorLine }), CURSOR_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [cursorLine]);

  // The floating image toolbar only makes sense in the live Flow view —
  // switching documents or to Pages (the exact paginated "what you'll
  // publish" view) drops any selection rather than risk it pointing at
  // the wrong line.
  useEffect(() => {
    setSelectedImageLine(null);
  }, [doc.id, mode]);

  // Frame → host messages.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === "preview-ready") {
        readyRef.current = true;
        // While peeking at the cover, a fresh iframe already sits on it —
        // following the cursor would immediately scroll away again.
        if (cursorRef.current > 1 && !peekingRef.current) post({ type: "scroll-to-line", line: cursorRef.current });
      } else if (d.type === "paged-done") {
        readyRef.current = true;
        setPaginating(false);
        const count = typeof d.pages === "number" && d.pages > 0 ? d.pages : null;
        setPages(count);
        if (count && !d.error && builtForRef.current) {
          onPagesKnownRef.current?.(count, builtForRef.current.body, builtForRef.current.factKey);
        }
        // Repagination reloads the iframe from scratch, which resets its
        // zoom to fit-width — restore whatever the reader last chose.
        if (pendingZoomRestoreRef.current !== null) {
          post({ type: "set-zoom", zoom: pendingZoomRestoreRef.current });
          pendingZoomRestoreRef.current = null;
        }
        if (peekingRef.current) post({ type: "go-to-page", page: 1 });
        else if (cursorRef.current > 1) post({ type: "scroll-to-line", line: cursorRef.current });
      } else if (d.type === "paged-progress" && typeof d.pages === "number") {
        setLayoutPages(d.pages);
      } else if (d.type === "page-visible") {
        setCurrent(d.page);
      } else if (d.type === "flow-scroll" && typeof d.pct === "number") {
        setFlowPct(d.pct);
      } else if (d.type === "zoom" && typeof d.zoom === "number") {
        setZoom(d.zoom);
        const nextMode: ZoomMode = d.mode === "fit-width" || d.mode === "fit-page" ? d.mode : "custom";
        zoomCmdRef.current = nextMode === "custom" ? d.zoom : nextMode;
      } else if (d.type === "edit-focus") {
        editingRef.current = true;
      } else if (d.type === "edit-blur") {
        editingRef.current = false;
      } else if (d.type === "inline-edit") {
        if (typeof d.line === "number") onEditRef.current({ line: d.line, text: d.text });
        else if (typeof d.field === "string") onEditRef.current({ field: d.field, text: d.text });
      } else if (d.type === "preview-click" && typeof d.line === "number") {
        if (d.image) {
          setSelectedImageLine(d.line); // keep focus in the preview — don't jump to the editor
        } else {
          setSelectedImageLine(null);
          if (d.line > 0) onFocusLineRef.current(d.line, !d.editable);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Editor → preview position sync. The host calls this (from editor
  // scrolling) with a 0–1 fraction; both iframe harnesses accept
  // "scroll-to-pct" and — with the body flag — map it onto the *authored
  // content* only, skipping the generated cover/TOC pages, so the editor
  // and preview represent the same logical document position. Registered
  // through a ref so a scroll never re-renders Preview.
  useEffect(() => {
    if (!scrollSyncRef) return;
    scrollSyncRef.current = (pct: number) => {
      if (!readyRef.current || peekingRef.current) return;
      frameRef.current?.contentWindow?.postMessage({ type: "scroll-to-pct", pct, body: true }, "*");
    };
    return () => {
      scrollSyncRef.current = null;
    };
  }, [scrollSyncRef]);

  function goTo(page: number) {
    if (!pages) return;
    const p = Math.max(1, Math.min(pages, page));
    setCurrent(p);
    post({ type: "go-to-page", page: p });
  }

  /** Jump the preview itself to the very top / bottom of the document. */
  const jumpPreview = (pct: number) => post({ type: "scroll-to-pct", pct });

  const isPages = mode === "pages";
  const isDark = theme === "dark";
  const editorView = getView?.() ?? null;
  const selectedImage = !isPages && selectedImageLine != null && editorView ? parseImageLine(editorView, selectedImageLine) : null;
  const pagesPercent = pages ? Math.round((current / pages) * 100) : 0;
  // Shared document position (0–1) for the Go-to-Top/Bottom buttons: the
  // flow view reports a scroll fraction directly; the paged view maps the
  // visible page onto first→last.
  const previewPct = isPages ? (pages && pages > 1 ? (current - 1) / (pages - 1) : 0) : flowPct;
  const flowTotal = estimatedPages && estimatedPages > 1 ? estimatedPages : 0;
  const flowPage = flowTotal ? Math.min(flowTotal, Math.floor(flowPct * flowTotal) + 1) : 0;
  const flowPercent = Math.round(flowPct * 100);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* One compact row, matching the editor toolbar's height and rhythm.
          Fit-width/fit-page live on in the harness (double-tap toggles
          fit ⇄ 100%, pinch/± zoom freely) — the two buttons were redundant. */}
      <div className="flex items-center gap-1 overflow-hidden border-b border-edge bg-surface px-1.5 py-1">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "flow", label: "Flow", hint: "Continuous live view — click or tap any line to edit it inline, updates instantly as you type." },
            { value: "pages", label: "Pages", hint: "Exact paginated view with running headers, footers and watermark — this is what you'll publish. Pinch, double-tap or use +/− to zoom." },
          ]}
        />

        {isPages && pages ? (
          <>
            <div className="hidden items-center gap-0 md:flex" role="group" aria-label="Zoom">
              <IconButton label="Zoom out" name="zoomOut" size={14} onClick={() => post({ type: "zoom-by", factor: 0.9 })} />
              <button
                type="button"
                title="Reset zoom to fit width"
                className="min-w-9 text-center text-[11px] font-semibold tabular-nums text-ink-2"
                onClick={() => post({ type: "set-zoom", zoom: "fit-width" })}
              >
                {Math.round(zoom * 100)}%
              </button>
              <IconButton label="Zoom in" name="zoomIn" size={14} onClick={() => post({ type: "zoom-by", factor: 1.1 })} />
            </div>
            <div className="flex min-w-0 items-center gap-0" role="group" aria-label="Page navigation">
              <IconButton label="Previous page" name="chevronLeft" size={14} onClick={() => goTo(current - 1)} />
              <span className="min-w-11 text-center text-[11px] font-semibold tabular-nums text-ink-2">{current} / {pages}</span>
              <IconButton label="Next page" name="chevronRight" size={14} onClick={() => goTo(current + 1)} />
              <span className="hidden min-w-8 text-center text-[11px] font-semibold tabular-nums text-faint sm:inline">{pagesPercent}%</span>
            </div>
          </>
        ) : !isPages ? (
          <span
            className="min-w-0 truncate text-[11px] tabular-nums text-ink-2"
            aria-live="polite"
            title={pagesExact ? "Exact pages — from the latest full layout" : "Estimated position — exact pages appear in the Pages view"}
          >
            {flowTotal ? (
              <><span className="font-semibold">Page {flowPage} / {pagesExact ? "" : "≈"}{flowTotal}</span> <span className="text-faint">· {flowPercent}%</span></>
            ) : (
              <span className="text-faint">Live preview · tap a title to edit</span>
            )}
          </span>
        ) : (
          <span className="text-xs tabular-nums text-faint" aria-live="polite">
            {paginating
              ? layoutPages > 0
                ? `Laying out pages… ${layoutPages}${estimatedPages && estimatedPages > 1 ? ` / ≈${estimatedPages}` : ""}`
                : "Laying out pages…"
              : ""}
          </span>
        )}

        <IconButton
          label={isDark ? "Switch document to light reading theme" : "Switch document to dark reading theme"}
          name={isDark ? "sun" : "moon"}
          size={15}
          className="ml-auto flex-none"
          onClick={() => saveSettings({ docTheme: isDark ? "light" : "dark" })}
        />
        <IconButton
          label={fullscreen ? "Exit full screen" : "Full screen"}
          name={fullscreen ? "collapse" : "expand"}
          size={15}
          active={fullscreen}
          className="flex-none"
          onClick={onToggleFullscreen}
        />
        {onCollapse && !fullscreen && (
          <IconButton label="Collapse preview panel" name="chevronRight" size={15} className="hidden flex-none md:inline-flex" onClick={onCollapse} />
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={frameRef}
          title="Document preview"
          srcDoc={srcDoc}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-same-origin allow-scripts"
        />
        <ScrollJump pct={previewPct} onTop={() => jumpPreview(0)} onBottom={() => jumpPreview(1)} />
        {selectedImage && (
          <div className="absolute left-1/2 top-2 z-10 flex max-w-[94%] -translate-x-1/2 items-start gap-1 rounded-xl border border-edge bg-surface px-3 py-2 shadow-xl">
            <ImageEditControls
              key={selectedImage.line}
              info={selectedImage}
              onPatch={(patch, opts) => {
                const v = getView?.();
                if (v) patchImageLine(v, selectedImage.line, patch, opts);
              }}
              onReplace={async (file) => {
                const v = getView?.();
                if (!v) return;
                const src = await imageFileToDataUrl(file);
                patchImageLine(v, selectedImage.line, { src });
                toast("Image replaced", "ok");
              }}
              onRemove={() => {
                const v = getView?.();
                if (v) removeImageLine(v, selectedImage.line);
                setSelectedImageLine(null);
              }}
            />
            <IconButton label="Close image toolbar" name="x" size={14} onClick={() => setSelectedImageLine(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
