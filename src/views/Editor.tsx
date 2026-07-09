import { useCallback, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { navigate } from "../lib/router";
import { flushSaves, updateDoc, useApp } from "../lib/store";
import { contentStats, cx } from "../lib/utils";
import type { Doc } from "../lib/types";
import { exportPdf, type ExportPhase } from "../pdf/export";
import { Button, IconButton, Segmented, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { CodeMirror } from "./editor/CodeMirror";
import { Toolbar } from "./editor/Toolbar";
import { Preview } from "./editor/Preview";
import { Details } from "./editor/Details";
import { AiPanel } from "./editor/AiPanel";

type Tab = "write" | "preview";

export function Editor({ id }: { id: string }) {
  const { docs, brand, settings } = useApp();
  const toast = useToast();
  const doc = docs.find((d) => d.id === id);

  const viewRef = useRef<EditorView | null>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase | null>(null);

  const onChange = useCallback((patch: Partial<Doc>) => updateDoc(id, patch), [id]);

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-faint">
        <p className="text-sm">This document doesn’t exist anymore.</p>
        <Button icon="back" onClick={() => navigate("library")}>
          Back to library
        </Button>
      </div>
    );
  }

  const stats = contentStats(doc.body);

  async function handleExport() {
    if (exportPhase) return;
    flushSaves();
    try {
      const result = await exportPdf(doc!, brand, settings, setExportPhase);
      if (result.fallback) toast("Page layout failed — exported the simple layout instead.", "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed.", "error");
    } finally {
      setExportPhase(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-edge bg-surface px-2.5 py-2 sm:px-4">
        <IconButton label="Back to library" name="back" size={18} onClick={() => navigate("library")} />
        <input
          value={doc.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 truncate bg-transparent text-[15px] font-bold outline-none placeholder:text-faint"
          placeholder="Untitled document"
          aria-label="Document title"
        />
        <span className="hidden text-xs text-faint lg:inline">{stats.words.toLocaleString()} words · autosaved</span>
        <IconButton label="Document details" name="sliders" onClick={() => setDetailsOpen(true)} />
        <IconButton label="AI assistant" name="sparkles" active={aiOpen} onClick={() => setAiOpen((v) => !v)} />
        <Button variant="primary" icon="export" onClick={handleExport} disabled={exportPhase !== null} className="px-2.5 sm:px-3">
          <span className="hidden sm:inline">{exportPhase ? "Preparing…" : "Export PDF"}</span>
        </Button>
      </header>

      {/* Write / Preview switch on small screens */}
      <div className="flex justify-center border-b border-edge bg-surface py-1.5 lg:hidden">
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "write", label: "Write", icon: "edit" },
            { value: "preview", label: "Preview", icon: "eye" },
          ]}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className={cx("min-w-0 flex-1 flex-col lg:flex lg:w-1/2 lg:border-r lg:border-edge", tab === "write" ? "flex" : "hidden")}>
          <Toolbar getView={() => viewRef.current} />
          <div className="min-h-0 flex-1">
            <CodeMirror
              value={doc.body}
              onChange={(body) => onChange({ body })}
              onSaveShortcut={() => {
                flushSaves();
                toast("Saved", "ok");
              }}
              viewRef={viewRef}
            />
          </div>
        </div>
        <div className={cx("min-w-0 flex-1 lg:block lg:w-1/2", tab === "preview" ? "block" : "hidden")}>
          <Preview doc={doc} brand={brand} />
        </div>

        <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} doc={doc} getView={() => viewRef.current} onChange={onChange} />
      </div>

      <Details open={detailsOpen} onClose={() => setDetailsOpen(false)} doc={doc} onChange={onChange} />

      {exportPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 rounded-2xl border border-edge bg-surface px-6 py-4 shadow-2xl">
            <Icon name="loader" size={18} className="animate-spin text-accent" />
            <span className="text-sm font-medium">
              {exportPhase === "paginating" ? "Laying out your PDF pages…" : "Opening print dialog…"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
