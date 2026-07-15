import type { EditorView } from "@codemirror/view";
import { imageFileToDataUrl } from "../../lib/image";
import { parseImageLine, patchImageLine, removeImageLine } from "./imageLine";
import { ImageEditControls } from "./ImageEditControls";
import { useToast } from "../../components/ui";

/** A slim, contextual bar that appears above the editor when the cursor
    sits on a standalone image line — resize, align, caption, replace or
    remove it without hand-editing the `{width=… align=…}` attribute
    syntax. Lives entirely in the Markdown source; the renderer and PDF
    engine already understand the attributes it writes (see
    markdown/renderer.ts § studio_figures). */
export function ImageTools({ getView, line }: { getView: () => EditorView | null; line: number }) {
  const toast = useToast();
  const view = getView();
  const info = view ? parseImageLine(view, line) : null;
  if (!info) return null;

  return (
    <div className="border-b border-edge bg-raised px-3 py-1.5">
      <ImageEditControls
        key={info.line}
        info={info}
        onPatch={(patch, opts) => {
          const v = getView();
          if (v) patchImageLine(v, info.line, patch, opts);
        }}
        onReplace={async (file) => {
          const v = getView();
          if (!v) return;
          const src = await imageFileToDataUrl(file);
          patchImageLine(v, info.line, { src });
          toast("Image replaced", "ok");
        }}
        onRemove={() => {
          const v = getView();
          if (v) removeImageLine(v, info.line);
        }}
      />
    </div>
  );
}
