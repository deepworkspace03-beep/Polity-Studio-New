/**
 * "Resume last session" — remembers the last document and cursor line
 * so the header action can jump straight back into it from anywhere
 * (Library, Settings, Help). Stored in localStorage, not IndexedDB: it
 * is throwaway UI state, not user content, and must be readable
 * synchronously before the app store has loaded.
 */

const KEY = "ps2:lastSession";

export interface LastSession {
  id: string;
  line: number;
}

export function saveLastSession(id: string, line: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, line: Math.max(1, line) }));
  } catch {
    /* private mode */
  }
}

export function getLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSession>;
    return typeof parsed.id === "string" ? { id: parsed.id, line: Number(parsed.line) || 1 } : null;
  } catch {
    return null;
  }
}
