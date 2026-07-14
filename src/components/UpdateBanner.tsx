import { useEffect, useState } from "react";
import { applyServiceWorkerUpdate, registerServiceWorker } from "../lib/pwa";
import { Button } from "./ui";
import { Icon } from "./Icon";

/**
 * Registers the service worker (public/sw.js) once at app start and
 * shows a small persistent banner when an update has finished installing
 * in the background — separate from the auto-dismissing Toast system
 * since this needs to stay visible with an action until the author
 * chooses to reload, not vanish after a few seconds. Documents live in
 * IndexedDB, untouched by the service worker, so reloading to update is
 * always safe.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Dev-server assets aren't content-hashed, so the service worker's
    // cache-first strategy would serve stale code during development —
    // only register against a real production build.
    if (import.meta.env.PROD) registerServiceWorker(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm shadow-lg">
        <Icon name="refresh" size={15} className="flex-none text-accent" />
        <span>An update is ready.</span>
        <Button variant="primary" className="px-2.5 py-1 text-xs" onClick={() => applyServiceWorkerUpdate()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
