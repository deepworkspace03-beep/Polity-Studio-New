import { goBack, canGoBack, navigate } from "../lib/router";
import { getLastSession } from "../lib/session";
import { IconButton, useToast } from "./ui";

/**
 * Cross-app header actions, shared by every top-level view so the reader
 * is never more than one tap from safety: step back to the previous page,
 * jump home, or resume exactly where they left off. ("Restart Studio" —
 * a hard reload — lives in Settings → Your data, not here: it's a rare
 * recovery action, not something that deserves permanent header real
 * estate that implies the app expects to get stuck.)
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
    <>
      <IconButton label="Back — return to the previous page" name="back" size={18} disabled={!canGoBack()} onClick={back} />
      {home && <IconButton label="Home — back to your library" name="home" size={18} onClick={() => navigate("library")} />}
      <IconButton label="Resume last session — reopen where you left off" name="history" size={18} onClick={resume} />
    </>
  );
}
