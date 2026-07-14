// Polity Studio service worker — offline-first caching for a static SPA.
//
// No build-time precache manifest (that needs a bundler plugin this repo
// deliberately doesn't carry — see ARCHITECTURE.md § design decision 7).
// Instead:
//   - navigations (the HTML shell) are network-first, falling back to the
//     last cached shell when offline, so a returning-online user always
//     gets the current version;
//   - everything else (JS/CSS bundles, fonts, icons) is cache-first —
//     Vite content-hashes those filenames, so a cache hit is guaranteed
//     byte-identical to what a fresh fetch would return, making
//     cache-first both safe and correct, not just fast.
// The net effect: the first successful online visit populates the cache
// with that visit's exact asset set; every offline visit after that is
// served entirely from cache. A new deploy is picked up automatically on
// the next online navigation (new hashed filenames simply cache-miss and
// get fetched), with the old worker only swapping in the new one after
// the page explicitly asks (see the "message" handler) — see lib/pwa.ts
// for the "update available" prompt this pairs with.
//
// install() additionally precaches the current app shell explicitly
// (fetching "/" fresh and pulling every hashed JS/CSS it references)
// rather than waiting for it to accumulate from organic navigation —
// without this, a single "open once, immediately go offline" session
// (no second reload) would still miss the very first document/JS/CSS
// fetch, since nothing controls the page until after this worker
// activates. Font woff2 files are deliberately left to the fetch
// handler's organic cache-first caching (below) rather than precached
// here — most documents use a handful of the ~30 bundled weights/
// scripts, and force-caching all of them on every install would undo
// the point of subsetting them per document elsewhere in the app.
const CACHE = "polity-studio-v1";
const SHELL_EXTRA = ["/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/vendor/paged.polyfill.min.js"];

self.addEventListener("install", (event) => {
  // Intentionally no self.skipWaiting() here — an installed update
  // waits until the page asks for it (via postMessage), so an update
  // never swaps the running app out from under someone mid-edit.
  event.waitUntil(
    fetch("/")
      .then((res) => res.text())
      .then((html) => {
        const hashed = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        const urls = ["/", ...hashed, ...SHELL_EXTRA];
        return caches.open(CACHE).then((c) => Promise.allSettled(urls.map((u) => c.add(u))));
      })
      .catch(() => {
        /* offline (or first install without a network) — the fetch handler's organic caching still covers later visits */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          const forPrune = res.clone();
          // Cache the fresh shell, then prune hashed assets no build
          // references anymore. Without this the cache grows without
          // bound across deploys (every old bundle stays forever). The
          // previous shell's assets are kept too, so a still-open tab
          // running the previous build can lazy-load its own chunks.
          caches.open(CACHE).then(async (c) => {
            const prev = await c.match("/");
            const prevHtml = prev ? await prev.text().catch(() => "") : "";
            await c.put(request, copy);
            try {
              const html = await forPrune.text();
              const live = new Set(
                [...(prevHtml + html).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]),
              );
              for (const key of await c.keys()) {
                const path = new URL(key.url).pathname;
                if (path.startsWith("/assets/") && !live.has(path)) await c.delete(key);
              }
            } catch {
              /* best-effort — next navigation will try again */
            }
          });
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});
