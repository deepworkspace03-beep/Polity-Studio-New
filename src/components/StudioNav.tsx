import { goBack, canGoBack, navigate } from "../lib/router";
import { getLastSession } from "../lib/session";
import { restartStudio } from "../lib/store";
import { IconButton, useToast } from "./ui";

/**
 * Cross-app header actions, shared by every top-level view so the reader
 * is never more than one tap from safety: step back to the previous page,
 * jump home, resume exactly where they left off, or — as a last resort —
 * Quick Reboot the app if the UI ever wedges. Quick Reboot is a plain,
 * non-destructive reload (pending edits are flushed first); it lives here
 * permanently so recovery is always one tap away, in every view.
 */
export function StudioNav({ home = true }: { home?: boolean }) {
  const toast = useToast();

  function back() {
    // Return to the previous in-app page. When there's nothing of ours to
    // go back to, explain rather than redirecting somewhere unexpected.
    if (!goBack()) toast("You're at the start — nothing to go back to", "info");
  }

  function resume() {
    const last = getLastSession();
    if (!last) {
      toast("No previous session yet — open a document first", "info");
      return;
    }
    navigate({ edit: last.id, line: last.line > 1 ? last.line : undefined });
  }

  return (
    // One tight cluster (gap-0.5), matching the right-hand action group in
    // every view header — both icon groups read as the same component and
    // the header's own larger gap only separates clusters, not icons.
    <div className="flex flex-none items-center gap-0.5">
      <IconButton label="Back — return to the previous page" name="back" size={18} disabled={!canGoBack()} onClick={back} />
      {home && <IconButton label="Home — back to your library" name="home" size={18} onClick={() => navigate("library")} />}
      <IconButton label="Resume last session — reopen where you left off" name="history" size={18} onClick={resume} />
      <IconButton
        label="Quick Reboot — reload the app if it becomes unresponsive. Your documents are saved first."
        name="refresh"
        size={18}
        onClick={() => void restartStudio()}
      />
    </div>
  );
}
