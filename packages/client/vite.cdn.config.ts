import { defineConfig } from "vite";

// One self-contained ES module of the SDK for direct use from a URL (no bundler, no install):
// import { createPotluck } from "https://wngstnr-code.github.io/potluck/sdk/potluck.js".
export default defineConfig({
  build: {
    target: "es2023",
    outDir: "dist-cdn",
    minify: true,
    sourcemap: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "potluck.js" },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
