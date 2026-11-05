import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short relative time ("5m ago" / "5分钟前") in the given locale; `nowLabel` for <45s. */
export function relativeTime(iso: string | Date | undefined, locale: string, nowLabel: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const sec = Math.round((ms - Date.now()) / 1000);
  if (Math.abs(sec) < 45) return nowLabel;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return rtf.format(Math.round(hr / 24), "day");
}
