/**
 * Copies the Paged.js browser build from node_modules into public/vendor
 * so the print iframe can load it as a plain script. Runs on postinstall,
 * keeping the vendored file in lockstep with the installed package version
 * without committing it to the repository.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pagedjs/dist/paged.polyfill.min.js");
const dest = join(root, "public/vendor/paged.polyfill.min.js");

if (!existsSync(src)) {
  console.warn("[sync-vendor] pagedjs dist not found — run npm install first");
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("[sync-vendor] public/vendor/paged.polyfill.min.js updated");
