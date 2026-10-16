// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { parseCsv } from "../src/csv";
import { detectChart } from "../src/detect";
import { exportPng, PRESETS } from "../src/export";
import { THEMES } from "../src/themes";
import sampleLine from "../samples/monthly-sales.csv?raw";
import sampleBar from "../samples/fruit-votes.csv?raw";
import sampleScatter from "../samples/height-weight.csv?raw";

const HERO_WEEKLY_COMMITS_CSV = [
  "week,commits",
  "2025-01-07,12",
  "2025-01-14,8",
  "2025-01-21,19",
  "2025-01-28,23",
  "2025-02-04,5",
  "2025-02-11,0",
  "2025-02-18,0",
  "2025-02-25,14",
  "2025-03-04,31",
  "2025-03-11,26",
  "2025-03-18,9",
  "2025-03-25,17",
  "2025-04-01,22",
  "2025-04-08,6",
  "2025-04-15,20",
  "2025-04-22,28",
].join("\n");

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("Generate Documentation Assets", () => {
  it("renders theme showcase and weekly-commits hero image with verified palette captions", async () => {
    const twitterPreset = PRESETS[0]; // 1200 x 675

    // 0. Hero Chart: Weekly commits with a two-week gap (matches README.md & SPEC.md)
    const parsedHero = parseCsv(HERO_WEEKLY_COMMITS_CSV);
    const detHero = detectChart(parsedHero);
    const blobHero = await exportPng(parsedHero, detHero, "Commits per week", twitterPreset, THEMES.editorial);
    const bufHero = Buffer.from(await blobHero.arrayBuffer());

    // 1. Editorial Line Chart
    const parsedLine = parseCsv(sampleLine);
    const detLine = detectChart(parsedLine);
    const blobEditorial = await exportPng(parsedLine, detLine, "Monthly Revenue & Expenses", twitterPreset, THEMES.editorial);
    const bufEditorial = Buffer.from(await blobEditorial.arrayBuffer());

    // 2. Corporate Bar Chart
    const parsedBar = parseCsv(sampleBar);
    const detBar = detectChart(parsedBar);
    const blobCorporate = await exportPng(parsedBar, detBar, "Team Choice by Category", twitterPreset, THEMES.corporate);
    const bufCorporate = Buffer.from(await blobCorporate.arrayBuffer());

    // 3. Nordic Scatter Chart
    const parsedScatter = parseCsv(sampleScatter);
    const detScatter = detectChart(parsedScatter);
    const blobNordic = await exportPng(parsedScatter, detScatter, "Height vs. Weight Distribution", twitterPreset, THEMES.nordic);
    const bufNordic = Buffer.from(await blobNordic.arrayBuffer());

    // 4. Compose a Balanced 3-column Theme Showcase Banner (themes-preview.png)
    const W = 2400;
    const H = 690;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Warm paper backdrop with calm comfortable texture
    ctx.fillStyle = "#f6f4ee";
    ctx.fillRect(0, 0, W, H);

    // Top Header: Title & Subtitle with quiet editorial typography
    ctx.fillStyle = "#1c1a15";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("CURATED BUSINESS THEMES", 60, 56);

    ctx.fillStyle = "#5e584b";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Three de-AI color systems hand-crafted for newsrooms, boardrooms, and modern engineering tools", 60, 84);

    const cards = [
      {
        theme: THEMES.editorial,
        label: "EDITORIAL",
        tagline: "Financial Times & Economist style",
        colorsLabel: "Paper #fffdf8 · Pine #155e4c · Ochre #ca8233",
        buf: bufEditorial,
        borderColor: "#e1dbce",
      },
      {
        theme: THEMES.corporate,
        label: "CORPORATE SLATE",
        tagline: "Executive decks & boardroom reports",
        colorsLabel: "Pure White #ffffff · Navy #0f4c81 · Sky #0284c7",
        buf: bufCorporate,
        borderColor: "#d8e0e8",
      },
      {
        theme: THEMES.nordic,
        label: "NORDIC MINIMAL",
        tagline: "Modern engineering & analytics tools",
        colorsLabel: "Cool Stone #fafaf9 · Charcoal #18181b · Cobalt #2563eb",
        buf: bufNordic,
        borderColor: "#dcdce0",
      },
    ];

    // Assert every hex in colorsLabel actually exists in that theme's bg or palette
    for (const card of cards) {
      const hexMatches = card.colorsLabel.match(/#[0-9a-fA-F]{6}/g) ?? [];
      expect(hexMatches.length).toBeGreaterThanOrEqual(3);
      const validHexes = new Set([
        card.theme.bg.toLowerCase(),
        ...card.theme.palette.map((c) => c.toLowerCase()),
      ]);
      for (const hex of hexMatches) {
        expect(validHexes.has(hex.toLowerCase()), `${card.label} colorsLabel hex ${hex} must belong to theme ${card.theme.id}`).toBe(true);
      }
    }

    const cardW = 733;
    const cardH = 550;
    const startY = 110;
    const gap = 40;
    const startX = 60;
    const cardRadius = 8;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const x = startX + i * (cardW + gap);
      const y = startY;

      // Card Background with rounded corners
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, cardRadius);
      ctx.fillStyle = card.theme.bg;
      ctx.fill();

      // Card Border (subtle hairline)
      ctx.strokeStyle = card.borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Theme Label
      ctx.fillStyle = card.theme.ink;
      ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(card.label, x + 24, y + 34);

      // Theme Tagline
      ctx.fillStyle = card.theme.muted;
      ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(card.tagline, x + 24, y + 54);

      // Palette swatches preview
      const swatchY = y + 21;
      const swatchSize = 13;
      const swatchGap = 4;
      const swatchStartX = x + cardW - 24 - card.theme.palette.length * (swatchSize + swatchGap);
      for (let s = 0; s < card.theme.palette.length; s++) {
        ctx.fillStyle = card.theme.palette[s];
        ctx.fillRect(swatchStartX + s * (swatchSize + swatchGap), swatchY, swatchSize, swatchSize);
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(swatchStartX + s * (swatchSize + swatchGap), swatchY, swatchSize, swatchSize);
      }

      // Draw the rendered chart into the card
      const img = await loadImage(card.buf);
      expect(img.width).toBe(twitterPreset.width);
      expect(img.height).toBe(twitterPreset.height);
      const chartPadding = 20;
      const chartTargetX = x + chartPadding;
      const chartTargetY = y + 74;
      const chartTargetW = cardW - chartPadding * 2;
      const chartTargetH = (chartTargetW * 675) / 1200; // 16:9 ratio = 389.8px

      ctx.drawImage(img, chartTargetX, chartTargetY, chartTargetW, chartTargetH);

      // Card Footer: Palette Spec
      ctx.fillStyle = card.theme.muted;
      ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(card.colorsLabel, x + 24, y + chartTargetH + 104);
    }

    const showcaseBuf = canvas.toBuffer("image/png");

    // Verify all generated buffers have valid PNG headers and dimensions
    for (const buf of [bufHero, bufEditorial, bufCorporate, bufNordic, showcaseBuf]) {
      expect(buf.byteLength).toBeGreaterThan(10_000);
      for (let i = 0; i < PNG_MAGIC.length; i++) {
        expect(buf[i]).toBe(PNG_MAGIC[i]);
      }
    }
    const heroImg = await loadImage(bufHero);
    expect(heroImg.width).toBe(twitterPreset.width);
    expect(heroImg.height).toBe(twitterPreset.height);

    const showcaseImg = await loadImage(showcaseBuf);
    expect(showcaseImg.width).toBe(W);
    expect(showcaseImg.height).toBe(H);

    // Only write to docs/ when explicitly requested via GENERATE_ASSETS=1
    if (process.env.GENERATE_ASSETS === "1") {
      const docsDir = path.resolve(__dirname, "../docs");
      fs.writeFileSync(path.join(docsDir, "hero.png"), bufHero);
      fs.writeFileSync(path.join(docsDir, "themes-preview.png"), showcaseBuf);
    }
  });
});
