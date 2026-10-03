// preview/vite.config.js — конфиг только для локального предпросмотра карточек (npm run preview:cards).
// Подменяет src/api.js на мок, всё остальное берётся из основного vite.config.ts.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

export default defineConfig({
  // root = preview/, чтобы предпросмотр открывался сразу на мок-сцене с карточками.
  // Импорты ../src/... работают через server.fs.allow.
  root: here,
  plugins: [
    {
      name: "mock-sp-api",
      enforce: "pre",
      resolveId(source) {
        if (source === "./api" || source === "../api" || source === "../../api" || source === "../../../api") {
          return path.resolve(here, "mockApi.js");
        }
        // DOB-модули (диалог связанной заявки) — тоже на мок, без SharePoint.
        if (/(^|\/)dobApi(\.js)?$/.test(source) || /(^|\/)dobClient(\.js)?$/.test(source)) {
          return path.resolve(here, "mockDob.js");
        }
        return null;
      },
    },
    react(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5180,
    open: false,
    fs: { allow: [root, here], strict: false },
  },
  ssr: { noExternal: true, external: ["jsdom"], target: "node" },
  build: {
    target: "esnext",
    rollupOptions: { output: { entryFileNames: "[name].mjs", chunkFileNames: "assets/[name]-[hash].mjs" } },
  },
});
