import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/demo",
  base: "./",
  plugins: [react()],
  publicDir: false,
  build: { outDir: "../../dist/demo", emptyOutDir: true },
});
