import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  deleteAllDocs,
  exportBackup,
  importBackup,
  resetSettingsAndBrand,
  saveBrand,
  saveSettings,
  useApp,
} from "../lib/store";
import { DEFAULT_BRAND } from "../brand/defaults";
import type { BrandConfig } from "../lib/types";
import { cx, downloadFile } from "../lib/utils";
import { buildZip } from "../lib/zip";
import { Button, Field, Modal, Segmented, Toggle, inputClass, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { StudioNav } from "../components/StudioNav";
import { toPortableMarkdown } from "../lib/image";

/** Remembers a section's open/closed state across reloads, falling back
    silently where storage is unavailable (private mode). */
function useDisclosure(key: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === "1";
    } catch {
      return initial;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  };
  return [open, toggle];
}

/** A titled, collapsible settings card. Everything stays one tap away, but
    long groups can fold out of sight to keep the page scannable on a
    tablet; the open/closed choice persists per group. */
function Section({
  title,
  description,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, toggle] = useDisclosure(storageKey, defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-edge bg-surface">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold">{title}</span>
          {description && <span className="mt-0.5 block text-xs text-faint">{description}</span>}
        </span>
        <Icon name="chevronDown" size={16} className={cx("flex-none text-faint transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="space-y-4 px-5 pb-5">{children}</div>}
    </section>
  );
}

const COLOR_LABELS: Record<keyof BrandConfig["colors"], string> = {
  primary: "Primary (headings)",
  primarySoft: "Primary soft",
  accent: "Accent",
  accentSoft: "Accent soft",
  gold: "Highlight tone",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function Settings() {
  const { settings, brand, docs } = useApp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(e.usage ?? null))
      .catch(() => setUsage(null));
  }, [docs.length]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-2">
        <StudioNav />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-xs text-faint">Every change saves automatically.</p>
        </div>
        <Button onClick={() => setConfirmReset(true)}>Restore defaults</Button>
      </header>

      <div className="space-y-5">
        <Section title="Appearance" storageKey="ps2:settings:appearance">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">App theme</span>
            <Segmented
              value={settings.theme}
              onChange={(theme) => saveSettings({ theme })}
              options={[
                { value: "dark", label: "Dark", icon: "moon" },
                { value: "light", label: "Light", icon: "sun" },
                { value: "system", label: "Auto", icon: "monitor" },
              ]}
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm">
              Document reading theme
              <span className="mt-0.5 block max-w-xs text-xs text-faint">
                Dark renders the document itself — previews, PDF and HTML exports — on an eye-friendly dark palette.
                Covers keep their own design.
              </span>
            </span>
            <Segmented
              value={settings.docTheme}
              onChange={(docTheme) => saveSettings({ docTheme })}
              options={[
                { value: "light", label: "Light", icon: "sun" },
                { value: "dark", label: "Dark", icon: "moon" },
              ]}
            />
          </div>
        </Section>

        <Section title="Branding" description="Drives every cover, header, footer, watermark and link in your PDFs." storageKey="ps2:settings:branding">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Institute name">
              <input className={inputClass} value={brand.name} onChange={(e) => saveBrand({ name: e.target.value })} />
            </Field>
            <Field label="Initiative line">
              <input className={inputClass} value={brand.initiative} onChange={(e) => saveBrand({ initiative: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <input className={inputClass} value={brand.tagline} onChange={(e) => saveBrand({ tagline: e.target.value })} />
            </Field>
            <Field label="Website">
              <input className={inputClass} value={brand.website} onChange={(e) => saveBrand({ website: e.target.value })} />
            </Field>
            <Field label="Telegram URL" hint="Linked from the icon in every page footer.">
              <input className={inputClass} value={brand.telegram.url} onChange={(e) => saveBrand({ telegram: { ...brand.telegram, url: e.target.value } })} />
            </Field>
            <Field label="WhatsApp URL" hint="Linked from the icon in every page footer.">
              <input className={inputClass} value={brand.whatsapp.url} onChange={(e) => saveBrand({ whatsapp: { ...brand.whatsapp, url: e.target.value } })} />
            </Field>
            <Field label="Default author">
              <input className={inputClass} value={brand.author} onChange={(e) => saveBrand({ author: e.target.value })} />
            </Field>
            <Field label="Watermark text">
              <input className={inputClass} value={brand.watermarkText} onChange={(e) => saveBrand({ watermarkText: e.target.value })} />
            </Field>
          </div>
          <Field label="Exam list" hint="One per line — offered when filling document details.">
            <textarea
              className={inputClass + " resize-none"}
              rows={4}
              value={brand.exams.join("\n")}
              onChange={(e) => saveBrand({ exams: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
            />
          </Field>
          <div>
            <span className="mb-2 block text-xs font-semibold text-ink-2">PDF colors</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(Object.keys(COLOR_LABELS) as (keyof BrandConfig["colors"])[]).map((key) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-edge px-2.5 py-2">
                  <input
                    type="color"
                    value={brand.colors[key]}
                    onChange={(e) => saveBrand({ colors: { ...brand.colors, [key]: e.target.value } })}
                    className="h-6 w-8 flex-none cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="text-xs text-ink-2">{COLOR_LABELS[key]}</span>
                </label>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-2 px-2 py-1 text-xs"
              onClick={() => {
                saveBrand({ colors: { ...DEFAULT_BRAND.colors } });
                toast("Colors reset to Polity Made Simple defaults", "ok");
              }}
            >
              Reset colors to default
            </Button>
          </div>
        </Section>

        <Section title="New document defaults" description="Applied to newly created documents — each document can still override them in its Settings pane." storageKey="ps2:settings:defaults">
          <Field label="PDF filename pattern" hint="{title}, {brand} and {date} are replaced automatically.">
            <input className={inputClass} value={settings.fileNamePattern} onChange={(e) => saveSettings({ fileNamePattern: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <Toggle label="Cover page" checked={settings.newDocLayout.cover} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, cover: v } })} />
            <Toggle label="Table of contents" checked={settings.newDocLayout.toc} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, toc: v } })} />
            <Toggle label="Watermark" checked={settings.newDocLayout.watermark} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, watermark: v } })} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Page size">
              <Segmented
                value={settings.newDocLayout.pageSize}
                onChange={(pageSize) => saveSettings({ newDocLayout: { ...settings.newDocLayout, pageSize } })}
                columns={3}
                options={[
                  { value: "a4", label: "A4" },
                  { value: "a5", label: "A5" },
                  { value: "letter", label: "Letter" },
                ]}
              />
            </Field>
            <Field label="Text density">
              <Segmented
                value={settings.newDocLayout.density}
                onChange={(density) => saveSettings({ newDocLayout: { ...settings.newDocLayout, density } })}
                columns={2}
                options={[
                  { value: "ultra", label: "Ultra" },
                  { value: "compact", label: "Compact" },
                  { value: "comfort", label: "Comfort" },
                  { value: "relaxed", label: "Relaxed" },
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Storage & data"
          description="Nothing is ever uploaded — everything below lives only in this browser, on this device."
          storageKey="ps2:settings:storage"
        >
          {/* 1 · The only thing that is your data and worth backing up. */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Documents & settings</h3>
              <p className="mt-0.5 text-xs text-faint">
                Saved in this browser's local database (IndexedDB). This is your work — back it up before clearing
                browser data, since clearing site data deletes it.
              </p>
            </div>
            <p className="text-sm text-ink-2">
              {docs.length} document{docs.length === 1 ? "" : "s"}
              {usage !== null && <span className="text-faint"> · ~{formatBytes(usage)} stored</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                icon="download"
                onClick={() => {
                  downloadFile(`polity-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), "application/json");
                  toast("Backup downloaded", "ok");
                }}
              >
                Download backup
              </Button>
              <Button icon="upload" onClick={() => fileRef.current?.click()}>
                Restore backup
              </Button>
              <Button
                icon="file"
                disabled={docs.length === 0}
                onClick={() => {
                  // Plain Markdown files, not the app's JSON format — opens in
                  // any editor, not just this app, if you ever need to leave.
                  const used = new Set<string>();
                  const encoder = new TextEncoder();
                  const entries = docs.map((d) => {
                    const base = (d.title || "Untitled").replace(/[\\/:*?"<>|]/g, "·").trim() || "Untitled";
                    let name = `${base}.md`;
                    for (let i = 2; used.has(name); i++) name = `${base} (${i}).md`;
                    used.add(name);
                    const body = toPortableMarkdown(d.body.trim());
                    const content = /^#\s+/.test(body) ? body : `# ${d.title || "Untitled"}\n\n${body}`;
                    return { name, data: encoder.encode(content) };
                  });
                  downloadFile(`polity-studio-markdown-${new Date().toISOString().slice(0, 10)}.zip`, buildZip(entries), "application/zip");
                  toast(`Downloaded ${docs.length} document${docs.length === 1 ? "" : "s"} as Markdown`, "ok");
                }}
              >
                Export all as Markdown (.zip)
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const count = await importBackup(await file.text());
                    toast(`Restored ${count} document${count === 1 ? "" : "s"}`, "ok");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Restore failed", "error");
                  }
                }}
              />
            </div>
            <p className="text-xs text-faint">
              The JSON backup restores exactly here; the Markdown zip is one plain .md file per document, readable in
              any editor if you ever need to leave.
            </p>
          </div>

          {/* 2 · Not user data — the app's own files, managed by the browser. */}
          <div className="border-t border-edge pt-4">
            <h3 className="text-sm font-semibold text-ink">Offline app cache</h3>
            <p className="mt-0.5 text-xs text-faint">
              Polity Studio installs as an app, so the browser keeps a copy of its files to load fast and work
              offline. This is the program, not your documents — it rebuilds itself automatically and never needs
              backing up.
            </p>
          </div>

          {/* 3 · Explicitly nothing is retained. */}
          <div className="border-t border-edge pt-4">
            <h3 className="text-sm font-semibold text-ink">Generated PDFs</h3>
            <p className="mt-0.5 text-xs text-faint">
              Not stored anywhere. Each export is built fresh in memory and handed straight to your browser's save
              dialog, then discarded — the app keeps no copy.
            </p>
          </div>

          {/* Destructive action, set apart. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-4">
            <Button variant="danger" icon="trash" disabled={docs.length === 0} onClick={() => setConfirmWipe(true)}>
              Delete all documents…
            </Button>
          </div>
        </Section>

        <p className="pb-6 text-center text-xs text-faint">
          Polity Studio · {brand.name} — {brand.initiative}
        </p>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Restore default settings?">
        <p className="text-sm text-ink-2">
          Appearance, branding, colors and new-document defaults will be reset to the Polity Made Simple factory
          values. Your documents are not touched.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              await resetSettingsAndBrand();
              setConfirmReset(false);
              toast("Settings restored to defaults", "ok");
            }}
          >
            Restore defaults
          </Button>
        </div>
      </Modal>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Delete all documents?">
        <p className="text-sm text-ink-2">
          All {docs.length} document{docs.length === 1 ? "" : "s"} will be permanently deleted from this browser.
          Branding and preferences are kept. This cannot be undone — consider downloading a backup first.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmWipe(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger text-white"
            onClick={async () => {
              await deleteAllDocs();
              setConfirmWipe(false);
              toast("All documents deleted", "info");
            }}
          >
            Delete everything
          </Button>
        </div>
      </Modal>
    </div>
  );
}
