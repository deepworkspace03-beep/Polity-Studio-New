import { useEffect, useRef, useState } from "react";
import type { BrandConfig, Doc } from "../../lib/types";
import { buildDocumentHtml } from "../../pdf/document";
import { Segmented } from "../../components/ui";

type PreviewMode = "flow" | "pages";

const FLOW_DEBOUNCE = 500;
const PAGED_DEBOUNCE = 1500;

/**
 * Live preview — Flow renders instantly while typing; Pages runs the
 * real Paged.js pipeline and shows the exact printed pages (headers,
 * footers, page numbers, watermark).
 */
export function Preview({ doc, brand }: { doc: Doc; brand: BrandConfig }) {
  const [mode, setMode] = useState<PreviewMode>("flow");
  const [html, setHtml] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [paginating, setPaginating] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setPages(null);
    if (mode === "pages") setPaginating(true);
    const timer = setTimeout(
      () => {
        setHtml(
          buildDocumentHtml(doc, brand, {
            mode: mode === "pages" ? "paged" : "flow",
            purpose: "preview",
          }),
        );
      },
      mode === "pages" ? PAGED_DEBOUNCE : FLOW_DEBOUNCE,
    );
    return () => clearTimeout(timer);
  }, [doc, brand, mode]);

  // The harness posts { type: "paged-done", pages } when layout finishes.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === "paged-done") {
        setPaginating(false);
        setPages(typeof e.data.pages === "number" && e.data.pages > 0 ? e.data.pages : null);
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
        <span className="text-xs text-faint">
          {mode === "pages" ? (paginating ? "Laying out pages…" : pages ? `${pages} pages` : "") : "Live preview"}
        </span>
      </div>
      <iframe
        ref={frameRef}
        title="Document preview"
        srcDoc={html}
        className="h-full w-full flex-1 border-0 bg-white"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  );
}
