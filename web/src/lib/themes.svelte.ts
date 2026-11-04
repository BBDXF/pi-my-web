/**
 * App themes. Default Light/Dark plus ports of popular VS Code themes.
 * Palettes come from each theme's official package (workbench `colors` + terminal ANSI):
 *  - GitHub Light Default  primer/github-vscode-theme
 *  - Atom One Light        akamud/vscode-theme-onelight
 *  - Solarized Light       microsoft/vscode extensions/theme-solarized-light
 *  - One Dark Pro          Binaryify/OneDark-Pro
 *  - Dracula               dracula/visual-studio-code
 *  - Tokyo Night           enkia/tokyo-night-vscode-theme
 * Muted text, a few buttons and accents are nudged where the original fell under ~4.5:1 contrast.
 * Applied as CSS variables on <html>; persisted.
 */

export type ThemeDef = {
  id: string;
  label: string;
  labelZh: string;
  dark: boolean;
  bg: string; // editor.background
  surface: string; // sideBar.background (sidebar / cards)
  popover: string; // widget / dropdown background
  fg: string;
  muted: string; // hover / selection fill
  mutedFg: string;
  border: string;
  primary: string; // button.background
  primaryFg: string;
  accent: string; // focus / links
  destructive: string;
  add: string; // diff inserted
  del: string; // diff removed
  hunk: string; // diff hunk header
  codeBg: string;
  /** Shiki theme key used for code (CSS var --shiki-<key>). */
  code: "light" | "dark" | "one-light" | "solarized-light" | "one-dark-pro" | "dracula" | "tokyo-night";
};

export const THEMES: ThemeDef[] = [
  { id: "light", label: "Light", labelZh: "浅色", dark: false, bg: "#faf9f7", surface: "#ffffff", popover: "#ffffff", fg: "#0a0a0b", muted: "#f1f1f3", mutedFg: "#71717a", border: "#e4e4e7", primary: "#18181b", primaryFg: "#fafafa", accent: "#18181b", destructive: "#dc2626", add: "#16a34a", del: "#dc2626", hunk: "#2563eb", codeBg: "#f4f4f5", code: "light" },
  { id: "dark", label: "Dark", labelZh: "深色", dark: true, bg: "#0a0a0b", surface: "#111113", popover: "#111113", fg: "#fafafa", muted: "#1f1f23", mutedFg: "#a1a1aa", border: "#27272a", primary: "#fafafa", primaryFg: "#18181b", accent: "#fafafa", destructive: "#ef4444", add: "#4ade80", del: "#f87171", hunk: "#60a5fa", codeBg: "#161618", code: "dark" },
  // Light ports
  { id: "github-light", label: "GitHub Light", labelZh: "GitHub 浅色", dark: false, bg: "#ffffff", surface: "#f6f8fa", popover: "#ffffff", fg: "#1f2328", muted: "#eaeef2", mutedFg: "#656d76", border: "#d0d7de", primary: "#1f883d", primaryFg: "#ffffff", accent: "#0969da", destructive: "#cf222e", add: "#1a7f37", del: "#cf222e", hunk: "#0969da", codeBg: "#f6f8fa", code: "light" },
  { id: "one-light", label: "Atom One Light", labelZh: "Atom One 浅色", dark: false, bg: "#fafafa", surface: "#eaeaeb", popover: "#ffffff", fg: "#383a42", muted: "#e1e1e2", mutedFg: "#626570", border: "#dbdbdc", primary: "#5871ef", primaryFg: "#ffffff", accent: "#526fff", destructive: "#e45649", add: "#50a14f", del: "#e45649", hunk: "#4078f2", codeBg: "#f0f0f1", code: "one-light" },
  { id: "solarized-light", label: "Solarized Light", labelZh: "Solarized 浅色", dark: false, bg: "#fdf6e3", surface: "#eee8d5", popover: "#eee8d5", fg: "#586e75", muted: "#e6dfcb", mutedFg: "#5b7077", border: "#ddd6c1", primary: "#ac9d57", primaryFg: "#073642", accent: "#268bd2", destructive: "#dc322f", add: "#859900", del: "#dc322f", hunk: "#268bd2", codeBg: "#f5eedb", code: "solarized-light" },
  // Dark ports
  { id: "one-dark-pro", label: "One Dark Pro", labelZh: "One Dark Pro", dark: true, bg: "#282c34", surface: "#21252b", popover: "#21252b", fg: "#abb2bf", muted: "#2c313a", mutedFg: "#8b92a0", border: "#3e4452", primary: "#61afef", primaryFg: "#282c34", accent: "#61afef", destructive: "#e05561", add: "#8cc265", del: "#e05561", hunk: "#4aa5f0", codeBg: "#21252b", code: "one-dark-pro" },
  { id: "dracula", label: "Dracula", labelZh: "Dracula", dark: true, bg: "#282a36", surface: "#21222c", popover: "#343746", fg: "#f8f8f2", muted: "#44475a", mutedFg: "#a3abcf", border: "#44475a", primary: "#bd93f9", primaryFg: "#282a36", accent: "#bd93f9", destructive: "#ff5555", add: "#50fa7b", del: "#ff5555", hunk: "#8be9fd", codeBg: "#21222c", code: "dracula" },
  { id: "tokyo-night", label: "Tokyo Night", labelZh: "Tokyo Night", dark: true, bg: "#1a1b26", surface: "#16161e", popover: "#16161e", fg: "#a9b1d6", muted: "#202330", mutedFg: "#7f87ad", border: "#2a2e42", primary: "#3d59a1", primaryFg: "#ffffff", accent: "#7aa2f7", destructive: "#f7768e", add: "#73daca", del: "#f7768e", hunk: "#7aa2f7", codeBg: "#16161e", code: "tokyo-night" },
];

const KEY = "pi-gui-theme";

/** Ids from earlier builds → fallback by dark-ness. */
const LEGACY_LIGHT = new Set(["catppuccin-latte"]);
const LEGACY_DARK = new Set(["tokyonight", "catppuccin", "gruvbox", "nord", "one-dark"]);

function systemDefault(): string {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function read(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && THEMES.some((t) => t.id === v)) return v;
    if (v) {
      const migrated = LEGACY_LIGHT.has(v) ? "light" : LEGACY_DARK.has(v) ? "dark" : systemDefault();
      localStorage.setItem(KEY, migrated);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return systemDefault();
}

export const appTheme = $state<{ id: string }>({ id: "dark" });

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const r = document.documentElement;
  const mix = (c: string, pct: number, base = t.bg) => `color-mix(in oklab, ${c} ${pct}%, ${base})`;
  const v: Record<string, string> = {
    "--background": t.bg,
    "--foreground": t.fg,
    "--card": t.surface,
    "--card-foreground": t.fg,
    "--popover": t.popover,
    "--popover-foreground": t.fg,
    "--primary": t.primary,
    "--primary-foreground": t.primaryFg,
    "--secondary": t.muted,
    "--secondary-foreground": t.fg,
    "--muted": t.muted,
    "--muted-foreground": t.mutedFg,
    "--accent": t.muted,
    "--accent-foreground": t.fg,
    "--destructive": t.destructive,
    "--destructive-foreground": "#ffffff",
    "--border": t.border,
    "--input": t.border,
    "--ring": t.accent,
    "--sidebar": t.surface,
    "--sidebar-foreground": t.fg,
    "--sidebar-primary": t.primary,
    "--sidebar-primary-foreground": t.primaryFg,
    "--sidebar-accent": t.muted,
    "--sidebar-accent-foreground": t.fg,
    "--sidebar-border": t.border,
    "--sidebar-ring": t.accent,
    "--pi-canvas": t.bg,
    "--pi-canvas-footer": mix(t.dark ? "white" : "black", 6),
    "--pi-accent": t.accent,
    // code + diff
    "--code-bg": t.codeBg,
    "--diff-add": t.add,
    "--diff-del": t.del,
    "--diff-hunk": t.hunk,
    "--diff-add-bg": mix(t.add, t.dark ? 16 : 14),
    "--diff-del-bg": mix(t.del, t.dark ? 16 : 14),
    "--diff-hunk-bg": mix(t.hunk, t.dark ? 12 : 12),
    "--diff-add-num": mix(t.add, t.dark ? 28 : 26),
    "--diff-del-num": mix(t.del, t.dark ? 28 : 26),
    "--diff-hunk-num": mix(t.hunk, t.dark ? 20 : 20),
    "--diff-num-bg": t.surface,
  };
  for (const [k, val] of Object.entries(v)) r.style.setProperty(k, val);
  r.classList.toggle("dark", t.dark);
  r.dataset.theme = t.id;
  // Code highlight theme: default light/dark use the stock dual-theme CSS vars.
  if (t.code === "light" || t.code === "dark") delete r.dataset.code;
  else r.dataset.code = t.code;
  r.style.colorScheme = t.dark ? "dark" : "light";
  appTheme.id = t.id;
}

export function initAppTheme() {
  applyTheme(read());
}

export function setAppTheme(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  applyTheme(id);
}
