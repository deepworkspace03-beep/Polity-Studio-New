import { navigate } from "../lib/router";
import { flushSaves } from "../lib/store";
import { getLastSession } from "../lib/session";
import { IconButton, useToast } from "./ui";

/**
 * Three cross-app header actions, shared by every top-level view so the
 * reader is never more than one tap from safety: jump home, resume
 * exactly where they left off, or recover from a stuck tab without
 * losing anything (autosave already covers that — this just forces a
 * clean reload).
 */
export function StudioNav({ home = true }: { home?: boolean }) {
  const toast = useToast();

  function resume() {
    const last = getLastSession();
    if (!last) {
      toast("No previous session yet — open a document first", "info");
      return;
    }
    navigate({ edit: last.id, line: last.line > 1 ? last.line : undefined });
  }

  async function restart() {
    flushSaves();
    // Give the debounced IndexedDB writes a beat to land before the
    // reload tears down the page.
    await new Promise((r) => setTimeout(r, 150));
    location.reload();
  }

  return (
    <>
      {home && <IconButton label="Home — back to your library" name="home" size={18} onClick={() => navigate("library")} />}
      <IconButton label="Resume last session — reopen where you left off" name="history" size={18} onClick={resume} />
      <IconButton label="Restart Studio — reload the app; your work is autosaved" name="refresh" size={18} onClick={restart} />
    </>
  );
}
