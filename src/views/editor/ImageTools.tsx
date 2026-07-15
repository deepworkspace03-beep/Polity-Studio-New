import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { imageFileToDataUrl } from "../../lib/image";
import { parseImageLine, patchImageLine, removeImageLine } from "./imageLine";
import { IconButton, Segmented, useToast } from "../../components/ui";

const WIDTH_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "35%", label: "S", hint: "Small — 35% width" },
  { value: "65%", label: "M", hint: "Medium — 65% width" },
  { value: "", label: "L", hint: "Large — full width" },
];

/** A slim, contextual bar that appears above the editor when the cursor
    sits on a standalone image line — resize, align, replace or remove it
    without hand-editing the `{width=… align=…}` attribute syntax. Lives
    entirely in the Markdown source; the renderer and PDF engine already
    understand the attributes it writes (see markdown/renderer.ts § studio_figures). */
export function ImageTools({ getView, line }: { getView: () => EditorView | null; line: number }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const view = getView();
  const info = view ? parseImageLine(view, line) : null;
  if (!info) return null;

  const width = WIDTH_OPTIONS.some((o) => o.value === info.width) ? info.width : "";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-raised px-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Image</span>
      <Segmented
        size="sm"
        value={width}
        onChange={(w) => {
          const v = getView();
          if (v) patchImageLine(v, info.line, { width: w });
        }}
        options={WIDTH_OPTIONS}
      />
      <Segmented
        size="sm"
        value={info.align}
        onChange={(align) => {
          const v = getView();
          if (v) patchImageLine(v, info.line, { align });
        }}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <span className="mx-0.5 h-4 w-px bg-edge" />
      <IconButton label="Replace image" name="upload" size={14} onClick={() => fileRef.current?.click()} />
      <IconButton
        label="Remove image"
        name="trash"
        size={14}
        onClick={() => {
          const v = getView();
          if (v) removeImageLine(v, info.line);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const v = getView();
          if (!v) return;
          try {
            const src = await imageFileToDataUrl(file);
            patchImageLine(v, info.line, { src });
            toast("Image replaced", "ok");
          } catch {
            toast("Couldn't read that image — try a PNG, JPEG or SVG", "error");
          }
        }}
      />
    </div>
  );
}
