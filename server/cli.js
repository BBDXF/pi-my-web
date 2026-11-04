#!/usr/bin/env node
/**
 * Standalone daemon: pi-my-web [--port 3847] [--host 127.0.0.1]
 * Env: PI_MY_WEB_PORT, PI_MY_WEB_HOST, PI_MY_WEB_PASSWORD (fallback: PI_GUI_*)
 */
import { createServer } from "./http.js";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(flag("--port") || (process.env.PI_MY_WEB_PORT ?? process.env.PI_GUI_PORT) || 3847);
const host = flag("--host") || (process.env.PI_MY_WEB_HOST ?? process.env.PI_GUI_HOST) || "127.0.0.1";

const app = createServer({ port, host });
app.listen();
if (!(process.env.PI_MY_WEB_PASSWORD ?? process.env.PI_GUI_PASSWORD) && host !== "127.0.0.1" && host !== "localhost") {
  console.warn("[pi-my-web] WARNING: non-loopback host without PI_MY_WEB_PASSWORD");
}

process.on("uncaughtException", (err) => {
  console.error("[pi-my-web] uncaughtException", err?.message || err);
});
process.on("unhandledRejection", (err) => {
  console.error("[pi-my-web] unhandledRejection", err);
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await app.close().catch(() => {});
    process.exit(0);
  });
}
