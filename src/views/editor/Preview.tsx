import { useEffect, useRef, useState } from "react";
import type { BrandConfig, Doc } from "../../lib/types";
import { buildDocContent, buildDocumentHtml, buildShellKey } from "../../pdf/document";
import { Segmented } from "../../components/ui";

type PreviewMode = "flow" | "pages";

const FLOW_DEBOUNCE = 220;
const PAGED_DEBOUNCE = 1400;
const CURSOR_DEBOUNCE = 120;

/**
 * Live preview.
 *
 * Flow — the iframe shell (fonts, styles, scripts) loads once; edits
 * swap only the rendered content in place via postMessage, so the
 * preview never flashes, never loses scroll position, and follows the
 * editor cursor through [data-line] markers.
 *
 * Pages — the real Paged.js pipeline; shows the exact printed pages
 * (headers, footers, page numbers, watermark) and re-jumps to the page
 * under the cursor after each re-layout.
 */
export function Preview({ doc, brand, cursorLine }: { doc: Doc; brand: BrandConfig; cursorLine: number }) {
  const [mode, setMode] = useState<PreviewMode>("flow");
  const [srcDoc, setSrcDoc] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [paginating, setPaginating] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const shellKeyRef = useRef("");
  const cursorRef = useRef(cursorLine);
  cursorRef.current = cursorLine;

  const post = (message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  };

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
        } else {
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

  // Frame → host messages: readiness, pagination results.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === "preview-ready") {
        readyRef.current = true;
        if (cursorRef.current > 1) post({ type: "scroll-to-line", line: cursorRef.current });
      } else if (e.data?.type === "paged-done") {
        readyRef.current = true;
        setPaginating(false);
        setPages(typeof e.data.pages === "number" && e.data.pages > 0 ? e.data.pages : null);
        if (cursorRef.current > 1) post({ type: "scroll-to-line", line: cursorRef.current });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-edge bg-surface px-3 py-1.5">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "flow", label: "Flow" },
            { value: "pages", label: "Pages" },
          ]}
        />
        <span className="text-xs text-faint" aria-live="polite">
          {mode === "pages" ? (paginating ? "Laying out pages…" : pages ? `${pages} pages` : "") : "Live preview"}
        </span>
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
