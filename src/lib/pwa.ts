/**
 * Service worker registration and update detection — see public/sw.js
 * for the caching strategy itself. Framework-free (registered from a
 * small effect in App.tsx); documents live entirely in IndexedDB, so a
 * service worker update can never lose data — it only ever swaps the
 * static app shell.
 */

export function registerServiceWorker(onUpdateReady: () => void): void {
  if (!("serviceWorker" in navigator)) return;

  const doRegister = () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // A worker may already be sitting in "waiting" from a previous
        // visit (e.g. this tab reused a cached page after an update
        // installed elsewhere) — surface it immediately.
        if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              onUpdateReady();
            }
          });
        });
      })
      .catch(() => {
        /* offline on first load, or the browser blocked registration — the app still works, just without offline caching this session */
      });
  };

  // registerServiceWorker() runs from a React effect, which mounts after
  // the JS bundle has parsed and hydrated — by then the window's "load"
  // event has usually already fired, so a plain addEventListener("load")
  // would wait forever. Register immediately once the document is already
  // complete; only defer to the "load" event if it genuinely hasn't
  // happened yet (e.g. a slow-loading page with large images).
  if (document.readyState === "complete") doRegister();
  else window.addEventListener("load", doRegister);

  // The new worker's activation (triggered by applyServiceWorkerUpdate)
  // fires this once; reload exactly once to pick up the new shell.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

/** Tells the waiting worker to activate — triggers the reload above. */
export function applyServiceWorkerUpdate(): void {
  navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
}
