/** Optional password auth (PI_GUI_PASSWORD). In-memory tokens, HttpOnly cookie. */
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

const COOKIE = "pi_gui_auth";

/** @param {string} a @param {string} b */
export function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** @param {{ password?: string }} [opts] */
export function createAuth(opts = {}) {
  const password = opts.password ?? process.env.PI_GUI_PASSWORD ?? "";
  const tokens = new Set();
  /** @param {import("node:http").IncomingMessage} req */
  const tokenOf = (req) => {
    const raw = req.headers.cookie || "";
    for (const part of raw.split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
    }
    return "";
  };
  return {
    required: Boolean(password),
    /** @param {import("node:http").IncomingMessage} req */
    isAuthenticated(req) {
      if (!password) return true;
      const t = tokenOf(req);
      return Boolean(t) && tokens.has(t);
    },
    /** @param {string} given @returns {string|null} Set-Cookie value */
    login(given) {
      if (!password || typeof given !== "string" || !safeEqual(given, password)) return null;
      const t = randomBytes(32).toString("hex");
      tokens.add(t);
      return `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`;
    },
    /** @param {import("node:http").IncomingMessage} req */
    logout(req) {
      tokens.delete(tokenOf(req));
      return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    },
  };
}
