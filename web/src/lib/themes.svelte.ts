/** App themes (pi / opencode inspired). Applied as CSS variables on <html>; persisted. */

export type ThemeDef = {
  id: string;
  label: string;
  dark: boolean;
  bg: string;
  surface: string; // cards / sidebar
  fg: string;
  muted: string;
  mutedFg: string;
  border: string;
  primary: string;
  primaryFg: string;
  destructive: string;
};

export const THEMES: ThemeDef[] = [
  { id: "dark", label: "Dark", dark: true, bg: "#0a0a0b", surface: "#111113", fg: "#fafafa", muted: "#1f1f23", mutedFg: "#a1a1aa", border: "#27272a", primary: "#fafafa", primaryFg: "#18181b", destructive: "#ef4444" },
  { id: "light", label: "Light", dark: false, bg: "#faf9f7", surface: "#ffffff", fg: "#0a0a0b", muted: "#f1f1f3", mutedFg: "#71717a", border: "#e4e4e7", primary: "#18181b", primaryFg: "#fafafa", destructive: "#ef4444" },
  { id: "tokyonight", label: "Tokyo Night", dark: true, bg: "#1a1b26", surface: "#16161e", fg: "#c0caf5", muted: "#292e42", mutedFg: "#7982a9", border: "#292e42", primary: "#7aa2f7", primaryFg: "#1a1b26", destructive: "#f7768e" },
  { id: "catppuccin", label: "Catppuccin Mocha", dark: true, bg: "#1e1e2e", surface: "#181825", fg: "#cdd6f4", muted: "#313244", mutedFg: "#9399b2", border: "#3b3d52", primary: "#cba6f7", primaryFg: "#1e1e2e", destructive: "#f38ba8" },
  { id: "catppuccin-latte", label: "Catppuccin Latte", dark: false, bg: "#eff1f5", surface: "#e6e9ef", fg: "#4c4f69", muted: "#dce0e8", mutedFg: "#6c6f85", border: "#ccd0da", primary: "#8839ef", primaryFg: "#eff1f5", destructive: "#d20f39" },
  { id: "gruvbox", label: "Gruvbox Dark", dark: true, bg: "#282828", surface: "#1d2021", fg: "#ebdbb2", muted: "#3c3836", mutedFg: "#a89984", border: "#504945", primary: "#fabd2f", primaryFg: "#282828", destructive: "#fb4934" },
  { id: "nord", label: "Nord", dark: true, bg: "#2e3440", surface: "#272c36", fg: "#eceff4", muted: "#3b4252", mutedFg: "#9aa5b8", border: "#434c5e", primary: "#88c0d0", primaryFg: "#2e3440", destructive: "#bf616a" },
  { id: "one-dark", label: "One Dark", dark: true, bg: "#282c34", surface: "#21252b", fg: "#abb2bf", muted: "#333842", mutedFg: "#7f848e", border: "#3e4451", primary: "#61afef", primaryFg: "#282c34", destructive: "#e06c75" },
];

const KEY = "pi-gui-theme";

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
  } catch {
    /* ignore */
  }
  return systemDefault();
}

export const appTheme = $state<{ id: string }>({ id: "dark" });

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const r = document.documentElement;
  const v: Record<string, string> = {
    "--background": t.bg,
    "--foreground": t.fg,
    "--card": t.surface,
    "--card-foreground": t.fg,
    "--popover": t.surface,
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
    "--ring": t.primary,
    "--sidebar": t.surface,
    "--sidebar-foreground": t.fg,
    "--sidebar-primary": t.primary,
    "--sidebar-primary-foreground": t.primaryFg,
    "--sidebar-accent": t.muted,
    "--sidebar-accent-foreground": t.fg,
    "--sidebar-border": t.border,
    "--sidebar-ring": t.primary,
    "--pi-canvas": t.bg,
    "--pi-canvas-footer": `color-mix(in oklab, ${t.bg} 94%, ${t.dark ? "white" : "black"})`,
  };
  for (const [k, val] of Object.entries(v)) r.style.setProperty(k, val);
  r.classList.toggle("dark", t.dark);
  r.dataset.theme = t.id;
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
