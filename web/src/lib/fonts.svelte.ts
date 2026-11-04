/** UI font + code size preferences (persisted). Inter is only loaded when chosen. */

export type UiFont = "system" | "inter" | "noto";
export const CODE_SIZES = [
  { id: "s", scale: 0.9 },
  { id: "m", scale: 1 },
  { id: "l", scale: 1.15 },
  { id: "xl", scale: 1.3 },
] as const;
export type CodeSize = (typeof CODE_SIZES)[number]["id"];

/** Segoe UI next to Microsoft YaHei (Windows), SF/PingFang (macOS), Noto/Source Han (Linux). */
const SYSTEM = `"Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", Roboto, "Helvetica Neue", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", Arial, sans-serif`;
const STACKS: Record<UiFont, string> = {
  system: SYSTEM,
  inter: `"Inter Variable", ${SYSTEM}`,
  noto: `"Noto Sans", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Source Han Sans CN", ${SYSTEM}`,
};

const FONT_KEY = "pi-gui-ui-font";
const SIZE_KEY = "pi-gui-code-size";

function read<T extends string>(key: string, allowed: readonly string[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && allowed.includes(v)) return v as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export const fontPrefs = $state<{ font: UiFont; codeSize: CodeSize }>({ font: "system", codeSize: "m" });
export const UI_FONT_STACKS = STACKS;

let interLoaded = false;
function applyFont(f: UiFont) {
  if (f === "inter" && !interLoaded) {
    interLoaded = true;
    void import("@fontsource-variable/inter").catch(() => {
      interLoaded = false;
    });
  }
  document.documentElement.style.setProperty("--font-inter", STACKS[f]);
  fontPrefs.font = f;
}

function applySize(s: CodeSize) {
  const scale = CODE_SIZES.find((x) => x.id === s)?.scale ?? 1;
  document.documentElement.style.setProperty("--code-scale", String(scale));
  fontPrefs.codeSize = s;
}

export function initFonts() {
  applyFont(read<UiFont>(FONT_KEY, ["system", "inter", "noto"], "system"));
  applySize(read<CodeSize>(SIZE_KEY, CODE_SIZES.map((x) => x.id), "m"));
}

export function setUiFont(f: UiFont) {
  try {
    localStorage.setItem(FONT_KEY, f);
  } catch {
    /* ignore */
  }
  applyFont(f);
}

export function setCodeSize(s: CodeSize) {
  try {
    localStorage.setItem(SIZE_KEY, s);
  } catch {
    /* ignore */
  }
  applySize(s);
}
