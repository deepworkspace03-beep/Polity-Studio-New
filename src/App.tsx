import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./lib/router";
import { useApp } from "./lib/store";
import { ToastProvider } from "./components/ui";
import { Nav } from "./components/layout/Nav";
import { Library } from "./views/Library";

const Editor = lazy(() => import("./views/Editor").then((m) => ({ default: m.Editor })));
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));

export default function App() {
  const route = useRoute();
  const { ready, settings } = useApp();

  // Reflect the theme setting on <html> (also follows system changes).
  useEffect(() => {
    const apply = () => {
      const t =
        settings.theme === "system"
          ? matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : settings.theme;
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem("ps2:theme", t);
      } catch {
        /* private mode */
      }
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  if (!ready) {
    return <div className="flex h-full items-center justify-center text-sm text-faint">Opening your studio…</div>;
  }

  return (
    <ToastProvider>
      <div className="flex h-full">
        <Nav />
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-faint">Loading…</div>}>
            {route.view === "editor" ? (
              <Editor id={route.id} />
            ) : route.view === "settings" ? (
              <Settings />
            ) : (
              <Library />
            )}
          </Suspense>
        </div>
      </div>
    </ToastProvider>
  );
}
