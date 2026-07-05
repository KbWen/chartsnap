/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

// Relative base so the built site works from any path on GitHub Pages
// (e.g. https://<user>.github.io/chartsnap/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  build: {
    target: "es2021",
  },
  test: {
    // Default to node; the SVG suite opts into jsdom via a file-level comment.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
