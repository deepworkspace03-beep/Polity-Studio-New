import { useRef, type ReactNode } from "react";
import { navigate } from "../lib/router";
import { exportBackup, importBackup, saveBrand, saveSettings, useApp } from "../lib/store";
import { DEFAULT_BRAND } from "../brand/defaults";
import { PROVIDER_PRESETS } from "../ai/client";
import type { AiConfig, BrandConfig } from "../lib/types";
import { downloadFile } from "../lib/utils";
import { Button, Field, IconButton, Segmented, Toggle, inputClass, useToast } from "../components/ui";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-edge bg-surface p-5">
      <h2 className="text-sm font-bold">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-xs text-faint">{description}</p>}
      <div className={description ? "space-y-4" : "mt-4 space-y-4"}>{children}</div>
    </section>
  );
}

const COLOR_LABELS: Record<keyof BrandConfig["colors"], string> = {
  primary: "Primary (headings)",
  primarySoft: "Primary soft",
  accent: "Accent",
  accentSoft: "Accent soft",
  gold: "Gold (highlights)",
};

export function Settings() {
  const { settings, brand } = useApp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const ai = (patch: Partial<AiConfig>) => saveSettings({ ai: { ...settings.ai, ...patch } });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-2">
        <IconButton label="Back to library" name="back" size={18} onClick={() => navigate("library")} />
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="space-y-5">
        <Section title="Appearance">
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
        </Section>

        <Section title="Branding" description="Drives every cover, header, footer, watermark and link in your PDFs.">
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
            <Field label="Telegram URL">
              <input className={inputClass} value={brand.telegram.url} onChange={(e) => saveBrand({ telegram: { ...brand.telegram, url: e.target.value } })} />
            </Field>
            <Field label="Telegram label">
              <input className={inputClass} value={brand.telegram.label} onChange={(e) => saveBrand({ telegram: { ...brand.telegram, label: e.target.value } })} />
            </Field>
            <Field label="WhatsApp URL">
              <input className={inputClass} value={brand.whatsapp.url} onChange={(e) => saveBrand({ whatsapp: { ...brand.whatsapp, url: e.target.value } })} />
            </Field>
            <Field label="Default author">
              <input className={inputClass} value={brand.author} onChange={(e) => saveBrand({ author: e.target.value })} />
            </Field>
          </div>
          <Field label="Watermark text">
            <input className={inputClass} value={brand.watermarkText} onChange={(e) => saveBrand({ watermarkText: e.target.value })} />
          </Field>
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

        <Section title="Export defaults" description="Applied to newly created documents — each document can still override them.">
          <Field label="PDF filename pattern" hint="{title}, {brand} and {date} are replaced automatically.">
            <input className={inputClass} value={settings.fileNamePattern} onChange={(e) => saveSettings({ fileNamePattern: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <Toggle label="Cover page" checked={settings.newDocLayout.cover} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, cover: v } })} />
            <Toggle label="Table of contents" checked={settings.newDocLayout.toc} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, toc: v } })} />
            <Toggle label="Watermark" checked={settings.newDocLayout.watermark} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, watermark: v } })} />
            <Toggle label="Closing brand page" checked={settings.newDocLayout.closingPage} onChange={(v) => saveSettings({ newDocLayout: { ...settings.newDocLayout, closingPage: v } })} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Field label="Page size">
              <Segmented
                value={settings.newDocLayout.pageSize}
                onChange={(pageSize) => saveSettings({ newDocLayout: { ...settings.newDocLayout, pageSize } })}
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
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "comfort", label: "Comfort" },
                  { value: "relaxed", label: "Relaxed" },
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="AI assistant"
          description="Bring your own key. It is stored only on this device and sent only to the endpoint below."
        >
          <Field label="Provider">
            <Segmented
              value={settings.ai.provider}
              onChange={(provider) => ai({ provider, baseUrl: PROVIDER_PRESETS[provider].baseUrl })}
              options={[
                { value: "openai", label: "OpenAI-compatible" },
                { value: "anthropic", label: "Anthropic" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Base URL" hint="Any compatible endpoint works (OpenRouter, Groq, local…).">
              <input className={inputClass} value={settings.ai.baseUrl} onChange={(e) => ai({ baseUrl: e.target.value })} />
            </Field>
            <Field label="Model" hint={PROVIDER_PRESETS[settings.ai.provider].modelHint}>
              <input className={inputClass} value={settings.ai.model} onChange={(e) => ai({ model: e.target.value })} />
            </Field>
          </div>
          <Field label="API key">
            <input type="password" autoComplete="off" className={inputClass} value={settings.ai.apiKey} onChange={(e) => ai({ apiKey: e.target.value })} placeholder="sk-…" />
          </Field>
        </Section>

        <Section title="Your data" description="Everything lives in this browser. Back it up regularly — especially before clearing browser data.">
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
          <p className="text-xs text-faint">Backups include documents, branding and preferences — API keys are never included.</p>
        </Section>

        <p className="pb-6 text-center text-xs text-faint">
          Polity Studio v2 · {brand.name} — {brand.initiative}
        </p>
      </div>
    </div>
  );
}
