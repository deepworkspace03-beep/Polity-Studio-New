/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["pdf-lib", "@pdf-lib/fontkit"],
  },
  test: {
    // happy-dom (not jsdom): lighter, and enough for what's tested here
    // (DOMParser + Node constants used by the HTML→Markdown walk).
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // Heavy libraries load only when the editor opens.
        manualChunks(id: string) {
          if (id.includes("@codemirror") || id.includes("@lezer")) return "codemirror";
          if (id.includes("markdown-it")) return "markdown";
          return undefined;
        },
      },
    },
  },
});
