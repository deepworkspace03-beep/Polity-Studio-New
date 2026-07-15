import { goBack, canGoBack, navigate } from "../lib/router";
import { getLastSession } from "../lib/session";
import { flushSaves } from "../lib/store";
import { IconButton, useToast } from "./ui";

/**
 * Cross-app header actions, shared by every top-level view so the reader
 * is never more than one tap from safety: step back to the previous page,
 * jump home, resume exactly where they left off, or reboot the app fresh.
 * Quick Reboot flushes pending saves first, so it can never lose an edit —
 * it's the project owner's requested one-tap recovery/refresh action.
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

  async function reboot() {
    flushSaves();
    // Give the flushed IndexedDB writes a beat to land before the reload
    // tears the page down (same pattern as Settings → Restart Studio).
    await new Promise((r) => setTimeout(r, 150));
    location.reload();
  }

  return (
    <>
      <IconButton label="Back — return to the previous page" name="back" size={18} disabled={!canGoBack()} onClick={back} />
      {home && <IconButton label="Home — back to your library" name="home" size={18} onClick={() => navigate("library")} />}
      <IconButton label="Resume last session — reopen where you left off" name="history" size={18} onClick={resume} />
      <IconButton label="Quick Reboot — save everything and reload the app fresh" name="refresh" size={18} onClick={() => void reboot()} />
    </>
  );
}
