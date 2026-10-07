// @vitest-environment jsdom
import { describe, it } from "vitest";
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

describe("Generate Documentation Assets", () => {
  it("renders theme showcase and hero image", async () => {
    const twitterPreset = PRESETS[0]; // 1200 x 675
    
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

    const docsDir = path.resolve(__dirname, "../docs");

    // Save hero.png as high quality Editorial line chart
    fs.writeFileSync(path.join(docsDir, "hero.png"), bufEditorial);

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
        colorsLabel: "Pure White #ffffff · Navy #0f4c81 · Slate #2f4161",
        buf: bufCorporate,
        borderColor: "#d8e0e8",
      },
      {
        theme: THEMES.nordic,
        label: "NORDIC MINIMAL",
        tagline: "Modern engineering & analytics tools",
        colorsLabel: "Cool Stone #fafaf9 · Charcoal #18181b · Slate #334155",
        buf: bufNordic,
        borderColor: "#dcdce0",
      },
    ];

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
    fs.writeFileSync(path.join(docsDir, "themes-preview.png"), showcaseBuf);
  });
});
