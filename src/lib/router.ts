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
  window.location.hash =
    typeof path === "string"
      ? path === "library"
        ? "#/"
        : `#/${path}`
      : `#/edit/${encodeURIComponent(path.edit)}${path.line ? `/${path.line}` : ""}`;
}
