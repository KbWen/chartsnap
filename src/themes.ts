import type { ChartTheme } from "./types";

/**
 * Curated, de-AI business themes tailored for distinct commercial presentation scenarios.
 * Designed with restrained typography, authentic paper/slate textures, and mathematically
 * verified CVD safety (Machado 2009 ΔE00 >= 15.0) & WCAG 1.4.11 contrast (>= 3:1).
 */
export const THEMES: Record<string, ChartTheme> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    description: "Warm paper & pine lead (Financial Times / Economist publication style)",
    bg: "#fffdf8",
    ink: "#1c1a15",
    muted: "#6f6a5f",
    grid: "#ece6d9",
    palette: ["#155e4c", "#ca8233", "#2f4161", "#5885e7", "#7b0900", "#b76385"],
  },
  corporate: {
    id: "corporate",
    name: "Corporate",
    description: "Pure white & classic navy lead (Boardroom / investor pitch deck style)",
    bg: "#ffffff",
    ink: "#0f172a",
    muted: "#475569",
    grid: "#e2e8f0",
    palette: ["#0f4c81", "#0284c7", "#0f766e", "#b45309", "#1f2937", "#7b0900"],
  },
  nordic: {
    id: "nordic",
    name: "Nordic",
    description: "Crisp stone & charcoal lead (Linear / Notion tech analytics style)",
    bg: "#fafaf9",
    ink: "#18181b",
    muted: "#52525b",
    grid: "#e4e4e7",
    palette: ["#18181b", "#2563eb", "#d97706", "#7b0900", "#b76385", "#2f4161"],
  },
};

export const DEFAULT_THEME_ID = "editorial";

/** Look up a theme by id, falling back to the default theme if unspecified or unrecognized. */
export function getTheme(id?: string): ChartTheme {
  if (id && THEMES[id]) return THEMES[id];
  return THEMES[DEFAULT_THEME_ID];
}

/** Return an array of all registered themes in registry order. */
export function listThemes(): ChartTheme[] {
  return Object.values(THEMES);
}

/**
 * Register or update a theme dynamically without modifying core chart logic.
 * Enables zero-friction theme expansion ("不要寫死").
 */
export function registerTheme(theme: ChartTheme): void {
  THEMES[theme.id] = theme;
}
