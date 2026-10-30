import { defineConfig } from "vite";

// Static build: the output is plain files (no server), deployable anywhere.
export default defineConfig({
  base: "./",
  build: { target: "es2023" },
});
