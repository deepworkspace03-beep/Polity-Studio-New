import { useSyncExternalStore } from "react";

/**
 * Hash-based routing (#/, #/edit/:id, #/settings) — three views need no
 * router library, and hash URLs make the built app deployable on any
 * static host with zero rewrite configuration.
 */

export type Route =
  | { view: "library" }
  | { view: "editor"; id: string; line?: number }
  | { view: "settings" }
  | { view: "help" };

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [head, ...rest] = hash.split("/");
  if (head === "edit" && rest[0]) {
    // Optional line segment (#/edit/:id/:line) deep-links search hits
    // to the matched body line.
    const line = Number(rest[1]);
    return { view: "editor", id: decodeURIComponent(rest[0]), line: Number.isInteger(line) && line > 0 ? line : undefined };
  }
  if (head === "settings") return { view: "settings" };
  if (head === "help") return { view: "help" };
  return { view: "library" };
}

let current = typeof window !== "undefined" ? parse() : ({ view: "library" } as Route);

/** Number of in-app navigations pushed onto browser history this session.
    Lets the Back button return to the previous Studio page without ever
    stepping out of the app (history.back() could otherwise leave the
    site) — when it's zero there is nothing of ours to go back to. */
let internalDepth = 0;

/** True when a Back action can return to a previous in-app page. */
export function canGoBack(): boolean {
  return internalDepth > 0;
}

/** Returns to the previous in-app page. Returns false (without navigating)
    when there is no in-app history, so callers can explain instead of
    redirecting somewhere the user didn't expect. */
export function goBack(): boolean {
  if (internalDepth <= 0) return false;
  internalDepth--;
  window.history.back();
  return true;
}

function subscribe(cb: () => void): () => void {
  const onChange = () => {
    current = parse();
    cb();
  };
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

export function navigate(path: "library" | "settings" | "help" | { edit: string; line?: number }): void {
  const next =
    typeof path === "string"
      ? path === "library"
        ? "#/"
        : `#/${path}`
      : `#/edit/${encodeURIComponent(path.edit)}${path.line ? `/${path.line}` : ""}`;
  // Only a real hash change pushes a history entry; navigating to the page
  // you're already on wouldn't, so it shouldn't grow the back depth either.
  if (next !== window.location.hash) internalDepth++;
  window.location.hash = next;
}
