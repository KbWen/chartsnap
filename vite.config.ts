/// <reference types="vitest/config" />
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

/** Every file the build produced, as posix paths relative to outDir. */
function builtFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return builtFiles(full, root);
    return [relative(root, full).split(sep).join(posix.sep)];
  });
}

function serviceWorkerSource(version: string, urls: string[]): string {
  return `// Generated at build time by vite.config.ts — do not edit.
// Precaches the built assets so chartsnap loads and charts with the network down.
const CACHE = "chartsnap-${version}";
const ASSETS = ${JSON.stringify(urls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Navigations go to the network first, so a fresh deploy shows up on the next load;
  // offline they fall back to the cached page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./").then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Assets are content-hashed, so a cache hit is always correct.
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`;
}

/**
 * Emits sw.js listing the real build output. Written in closeBundle so every asset,
 * including index.html, already exists on disk — no hardcoded filenames to drift.
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "chartsnap-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = builtFiles(outDir).filter((f) => f !== "sw.js");
      // The hashed JS bundle name is a precise version for the cache: it changes whenever
      // any of our code changes, and never otherwise.
      const version = files.find((f) => /^assets\/.*\.js$/.test(f))?.replace(/\W/g, "") ?? "dev";
      const urls = ["./", ...files.map((f) => `./${f}`)];
      writeFileSync(join(outDir, "sw.js"), serviceWorkerSource(version, urls));
    },
  };
}

// Relative base so the built site works from any path on GitHub Pages
// (e.g. https://<user>.github.io/chartsnap/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  build: {
    target: "es2021",
  },
  test: {
    // Default to node; the SVG suite opts into jsdom via a file-level comment.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
