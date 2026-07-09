import { useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { Doc } from "../../lib/types";
import { navigate } from "../../lib/router";
import { useApp } from "../../lib/store";
import { runCompletion } from "../../ai/client";
import { SYSTEM_PROMPT, WORKFLOWS } from "../../ai/prompts";
import { Button, IconButton, useToast } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/utils";

type Phase = "idle" | "running" | "done" | "error";

interface Scope {
  from: number;
  to: number;
  selection: boolean;
}

export function AiPanel({
  open,
  onClose,
  doc,
  getView,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  getView: () => EditorView | null;
  onChange: (patch: Partial<Doc>) => void;
}) {
  const { settings } = useApp();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [custom, setCustom] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [activeLabel, setActiveLabel] = useState("");
  const scopeRef = useRef<Scope>({ from: 0, to: 0, selection: false });
  const abortRef = useRef<AbortController | null>(null);

  if (!open) return null;

  const view = getView();
  const sel = view?.state.selection.main;
  const hasSelection = !!sel && !sel.empty;
  const configured = Boolean(settings.ai.apiKey);

  async function run(label: string, instruction: string) {
    if (!instruction.trim() || phase === "running") return;
    const v = getView();
    const s = v?.state.selection.main;
    const selection = !!s && !s.empty;
    const source = selection ? v!.state.sliceDoc(s.from, s.to) : doc.body;
    scopeRef.current = selection ? { from: s.from, to: s.to, selection: true } : { from: 0, to: doc.body.length, selection: false };

    if (!source.trim()) {
      toast("There is no content to work on yet.", "error");
      return;
    }

    setPhase("running");
    setActiveLabel(label);
    setOutput("");
    setError("");
    abortRef.current = new AbortController();
    try {
      const result = await runCompletion(settings.ai, {
        system: SYSTEM_PROMPT,
        prompt: `${instruction}\n\n---\n\n${source}`,
        signal: abortRef.current.signal,
        onDelta: (delta) => setOutput((o) => o + delta),
      });
      setOutput(result);
      setPhase("done");
    } catch (err) {
      if (abortRef.current?.signal.aborted) {
        setPhase("idle");
      } else {
        setError(err instanceof Error ? err.message : "The AI request failed.");
        setPhase("error");
      }
    }
  }

  function apply(mode: "replace" | "insert") {
    const scope = scopeRef.current;
    const v = getView();
    if (scope.selection && v) {
      const insertAt = mode === "replace" ? { from: scope.from, to: scope.to } : { from: scope.to, to: scope.to };
      const text = mode === "replace" ? output : `\n\n${output}`;
      v.dispatch({ changes: { ...insertAt, insert: text } });
    } else {
      onChange({ body: mode === "replace" ? output : `${doc.body.trimEnd()}\n\n${output}\n` });
    }
    toast(mode === "replace" ? "Applied to document" : "Inserted below", "ok");
    setPhase("idle");
    setOutput("");
  }

  return (
    <aside className="absolute inset-0 z-40 flex flex-col bg-surface md:inset-y-0 md:left-auto md:right-0 md:w-[380px] md:border-l md:border-edge md:shadow-2xl">
      <header className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
        <Icon name="sparkles" size={16} className="text-accent" />
        <h2 className="flex-1 text-sm font-bold">AI assistant</h2>
        {phase === "running" && (
          <Button
            className="px-2 py-1 text-xs"
            onClick={() => {
              abortRef.current?.abort();
              setPhase("idle");
            }}
          >
            Stop
          </Button>
        )}
        <IconButton label="Close AI assistant" name="x" onClick={onClose} />
      </header>

      {!configured ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Icon name="key" size={26} className="text-faint" />
          <p className="text-sm text-ink-2">Bring your own API key to unlock AI beautification, summaries, MCQ generation and more.</p>
          <p className="text-xs text-faint">Your key is stored only on this device and sent only to the provider you configure.</p>
          <Button variant="primary" icon="settings" onClick={() => navigate("settings")}>
            Set up in Settings
          </Button>
        </div>
      ) : phase === "running" || phase === "done" || phase === "error" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-faint">
            {phase === "running" && <Icon name="loader" size={13} className="animate-spin text-accent" />}
            <span className="font-semibold text-ink-2">{activeLabel}</span>
            <span>· {scopeRef.current.selection ? "selection" : "whole document"}</span>
          </div>
          {phase === "error" ? (
            <div className="mx-4 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">{error}</div>
          ) : (
            <pre className="mx-4 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-edge bg-raised p-3 font-mono text-xs leading-relaxed text-ink">
              {output || "…"}
            </pre>
          )}
          <div className="flex gap-2 p-4">
            {phase === "done" && (
              <>
                <Button variant="primary" icon="check" className="flex-1" onClick={() => apply("replace")}>
                  Replace {scopeRef.current.selection ? "selection" : "document"}
                </Button>
                <Button className="flex-1" onClick={() => apply("insert")}>
                  Insert below
                </Button>
              </>
            )}
            {(phase === "done" || phase === "error") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase("idle");
                  setOutput("");
                }}
              >
                Discard
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-xs text-faint">
            Works on {hasSelection ? "the selected text" : "the whole document"}
            {hasSelection ? "" : " — select text in the editor to work on a passage"}.
          </p>
          <div className="mb-4 grid grid-cols-1 gap-1.5">
            {WORKFLOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => run(w.label, w.prompt)}
                className={cx("rounded-lg border border-edge px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-raised")}
              >
                {w.label}
              </button>
            ))}
          </div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Custom instruction</label>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={3}
            placeholder="e.g. Rewrite this unit as a dialogue between examiner and student…"
            className="w-full resize-none rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
          <Button variant="primary" icon="sparkles" className="mt-2 w-full" disabled={!custom.trim()} onClick={() => run("Custom instruction", custom)}>
            Run
          </Button>
        </div>
      )}
    </aside>
  );
}
