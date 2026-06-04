import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@styles": path.resolve(__dirname, "./src/styles/_index.scss"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // @ts-expect-error - Vite types might not have api yet
        api: "modern",
      },
    },
  },
});
