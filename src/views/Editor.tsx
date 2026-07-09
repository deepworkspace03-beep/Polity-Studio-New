import { useCallback, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { navigate } from "../lib/router";
import { flushSaves, updateDoc, useApp } from "../lib/store";
import { contentStats, cx } from "../lib/utils";
import type { Doc } from "../lib/types";
import { Button, IconButton, Segmented, useToast } from "../components/ui";
import { CodeMirror } from "./editor/CodeMirror";
import { Toolbar } from "./editor/Toolbar";
import { Preview } from "./editor/Preview";
import { Details } from "./editor/Details";
import { Publish } from "./editor/Publish";

type Tab = "write" | "preview";

export function Editor({ id }: { id: string }) {
  const { docs, brand, settings } = useApp();
  const toast = useToast();
  const doc = docs.find((d) => d.id === id);

  const viewRef = useRef<EditorView | null>(null);
  const [tab, setTab] = useState<Tab>("write");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);

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
        <IconButton label="Document details & layout" name="sliders" onClick={() => setDetailsOpen(true)} />
        <Button
          variant="primary"
          icon="export"
          onClick={() => {
            flushSaves();
            setPublishOpen(true);
          }}
          className="px-2.5 sm:px-3"
        >
          <span className="hidden sm:inline">Publish PDF</span>
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
              onCursorLine={setCursorLine}
              onSaveShortcut={() => {
                flushSaves();
                toast("Saved", "ok");
              }}
              viewRef={viewRef}
            />
          </div>
        </div>
        <div className={cx("min-w-0 flex-1 lg:block lg:w-1/2", tab === "preview" ? "block" : "hidden")}>
          <Preview doc={doc} brand={brand} cursorLine={cursorLine} />
        </div>
      </div>

      <Details open={detailsOpen} onClose={() => setDetailsOpen(false)} doc={doc} onChange={onChange} />

      {publishOpen && <Publish doc={doc} brand={brand} settings={settings} onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
