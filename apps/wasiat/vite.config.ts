import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static build: the output is plain files (no server), deployable anywhere.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2023", sourcemap: true },
});
