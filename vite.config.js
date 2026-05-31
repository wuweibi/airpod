import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/airpod/",
  build: {
    outDir: "docs",
  },
  plugins: [react()],
});
