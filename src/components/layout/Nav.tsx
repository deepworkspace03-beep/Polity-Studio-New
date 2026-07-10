import { navigate, useRoute } from "../../lib/router";
import { saveSettings, useApp } from "../../lib/store";
import { cx } from "../../lib/utils";
import { Icon, TempleMark } from "../Icon";

/**
 * Persistent left navigation rail — desktop only. Restores the old
 * Studio's always-visible left-side navigation (home, settings, theme)
 * without reserving its old 240px: a slim icon rail costs far less of
 * the write/preview workspace while staying reachable from anywhere,
 * including mid-edit.
 */
export function Nav() {
  const { settings } = useApp();
  const route = useRoute();
  const isDark = settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <aside className="hidden w-16 flex-none flex-col items-center gap-1 border-r border-edge bg-surface py-3 md:flex">
      <button
        title="Polity Studio — Library"
        aria-label="Go to library"
        onClick={() => navigate("library")}
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1C3557] to-[#149C94] text-white"
      >
        <TempleMark size={20} />
      </button>

      <NavItem active={route.view === "library" || route.view === "editor"} label="Library" icon="file" onClick={() => navigate("library")} />
      <NavItem active={route.view === "settings"} label="Settings" icon="settings" onClick={() => navigate("settings")} />

      <span className="flex-1" />

      <NavItem
        label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        icon={isDark ? "sun" : "moon"}
        onClick={() => saveSettings({ theme: isDark ? "light" : "dark" })}
      />
    </aside>
  );
}

function NavItem({
  active,
  label,
  icon,
  onClick,
}: {
  active?: boolean;
  label: string;
  icon: "file" | "settings" | "sun" | "moon";
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cx(
        "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
        active ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-raised hover:text-ink",
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
