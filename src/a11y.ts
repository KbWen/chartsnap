import type { ChartConfiguration } from "chart.js";
import type { Detection, ParsedCsv } from "./types";

export function autoTitle(d: Detection): string {
  const ys = d.yColumns.map((c) => c.name);
  if (d.type === "scatter") return `${d.yColumns[1].name} vs ${d.yColumns[0].name}`;
  if (d.type === "line") return `${ys.join(", ")} over ${d.xColumn.name}`;
  return `${ys.join(", ")} by ${d.xColumn.name}`;
}

export function buildSrSummary(
  title: string,
  detection: Detection,
  config: ChartConfiguration
): string {
  const datasets = config.data?.datasets ?? [];
  const seriesNames = datasets.map((d) => d.label ?? "").filter(Boolean);

  if (detection.type === "scatter") {
    const ptCount = datasets[0]?.data?.length ?? 0;
    const xc = detection.yColumns[0]?.name ?? "X";
    const yc = detection.yColumns[1]?.name ?? "Y";
    return `${title}: scatter plot with ${ptCount} points comparing ${yc} against ${xc}.`;
  }

  if (detection.type === "line" && detection.timeAxis) {
    const ptCount = datasets[0]?.data?.length ?? 0;
    const seriesDesc =
      seriesNames.length > 0 ? ` across ${seriesNames.length} series (${seriesNames.join(", ")})` : "";
    return `${title}: line chart with ${ptCount} time points${seriesDesc}.`;
  }

  const categoryCount = config.data?.labels?.length ?? 0;
  const seriesDesc =
    seriesNames.length > 0 ? ` across ${seriesNames.length} series (${seriesNames.join(", ")})` : "";
  return `${title}: ${detection.type} chart with ${categoryCount} categories${seriesDesc}.`;
}

export function populateSrTable(
  tableEl: HTMLTableElement,
  summaryEl: HTMLElement,
  config: ChartConfiguration,
  detection: Detection,
  parsed: ParsedCsv,
  title: string
): void {
  summaryEl.textContent = buildSrSummary(title, detection, config);
  tableEl.replaceChildren();

  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = title;
  tableEl.appendChild(caption);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const tbody = document.createElement("tbody");

  if (detection.type === "scatter") {
    const [xc, yc] = detection.yColumns;
    const thX = document.createElement("th");
    thX.scope = "col";
    thX.textContent = xc.name;
    headerRow.appendChild(thX);

    const thY = document.createElement("th");
    thY.scope = "col";
    thY.textContent = yc.name;
    headerRow.appendChild(thY);

    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    const points = (config.data?.datasets?.[0]?.data ?? []) as { x: number; y: number }[];
    for (const pt of points) {
      const tr = document.createElement("tr");
      const tdX = document.createElement("td");
      tdX.textContent = String(pt.x);
      const tdY = document.createElement("td");
      tdY.textContent = String(pt.y);
      tr.appendChild(tdX);
      tr.appendChild(tdY);
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);
    return;
  }

  if (detection.type === "line" && detection.timeAxis) {
    const x = detection.xColumn;
    const thX = document.createElement("th");
    thX.scope = "col";
    thX.textContent = x.name;
    headerRow.appendChild(thX);

    const datasets = config.data?.datasets ?? [];
    for (const ds of datasets) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = ds.label ?? "";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    // Map chronologically sorted indices to get the original date raw string
    const validIndices: number[] = [];
    for (let r = 0; r < parsed.rowCount; r++) {
      if (!Number.isNaN(x.times[r])) validIndices.push(r);
    }
    validIndices.sort((a, b) => x.times[a] - x.times[b]);

    const rowCount = datasets[0]?.data?.length ?? 0;
    for (let r = 0; r < rowCount; r++) {
      const tr = document.createElement("tr");
      const origRow = validIndices[r];
      const thRow = document.createElement("th");
      thRow.scope = "row";
      thRow.textContent = origRow !== undefined ? x.raw[origRow] : "";
      tr.appendChild(thRow);

      for (const ds of datasets) {
        const td = document.createElement("td");
        const pt = (ds.data as { x: number; y: number | null }[])[r];
        td.textContent = pt?.y !== null && pt?.y !== undefined ? String(pt.y) : "";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);
    return;
  }

  // Categorical line / bar
  const labels = (config.data?.labels ?? []) as string[];
  const thX = document.createElement("th");
  thX.scope = "col";
  thX.textContent = detection.xColumn.name;
  headerRow.appendChild(thX);

  const datasets = config.data?.datasets ?? [];
  for (const ds of datasets) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = ds.label ?? "";
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  tableEl.appendChild(thead);

  for (let r = 0; r < labels.length; r++) {
    const tr = document.createElement("tr");
    const thRow = document.createElement("th");
    thRow.scope = "row";
    thRow.textContent = labels[r];
    tr.appendChild(thRow);

    for (const ds of datasets) {
      const td = document.createElement("td");
      const val = (ds.data as (number | null)[])[r];
      td.textContent = val !== null && val !== undefined ? String(val) : "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
}
