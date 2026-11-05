/** Persisted session files: list / archive / unarchive / delete (path-validated). */
import { readdir, readFile, stat, rename, unlink, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export function roots() {
  const agent = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent");
  return {
    live: path.resolve((process.env.PI_MY_WEB_SESSIONS_DIR ?? process.env.PI_GUI_SESSIONS_DIR) || path.join(agent, "sessions")),
    archive: path.resolve(
      (process.env.PI_MY_WEB_ARCHIVE_DIR ?? process.env.PI_GUI_ARCHIVE_DIR) || path.join(agent, "sessions-archive"),
    ),
  };
}

/** @param {string} root @param {string} p */
function under(root, p) {
  const rel = path.relative(root, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * @param {unknown} p
 * @returns {{ path: string, archived: boolean, rel: string }}
 */
export function validateStoredPath(p) {
  if (typeof p !== "string" || !p || p.includes("\0")) throw badPath();
  const abs = path.resolve(p);
  if (!abs.endsWith(".jsonl")) throw badPath();
  const r = roots();
  if (under(r.live, abs)) return { path: abs, archived: false, rel: path.relative(r.live, abs) };
  if (under(r.archive, abs))
    return { path: abs, archived: true, rel: path.relative(r.archive, abs) };
  throw badPath();
}
function badPath() {
  const e = new Error("Invalid session path");
  // @ts-expect-error
  e.status = 400;
  return e;
}

/** @param {string} dir @returns {Promise<string[]>} */
async function jsonlFiles(dir) {
  const out = [];
  let subs;
  try {
    subs = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of subs) {
    const full = path.join(dir, d.name);
    if (d.isFile() && d.name.endsWith(".jsonl")) out.push(full);
    else if (d.isDirectory()) {
      for (const f of await readdir(full).catch(() => [])) {
        if (f.endsWith(".jsonl")) out.push(path.join(full, f));
      }
    }
  }
  return out;
}

/** @param {unknown} content */
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.filter((c) => c?.type === "text").map((c) => c.text).join(" ");
  return "";
}

/** @param {string} file @param {boolean} archived */
async function summarize(file, archived) {
  const [raw, st] = await Promise.all([readFile(file, "utf8"), stat(file)]);
  let id = path.basename(file, ".jsonl");
  let cwd = "";
  let name;
  let parentSession;
  let firstMessage = "";
  let messageCount = 0;
  let modified = st.mtime;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "session") {
      if (e.id) id = e.id;
      if (e.cwd) cwd = e.cwd;
      if (typeof e.parentSession === "string" && e.parentSession) parentSession = e.parentSession;
    } else if (e.type === "session_info" && typeof e.name === "string") {
      name = e.name.trim() || undefined;
    } else if (e.type === "message") {
      const role = e.message?.role;
      if (role === "user" || role === "assistant") {
        messageCount++;
        if (role === "user" && !firstMessage) firstMessage = textOf(e.message.content).slice(0, 300);
      }
    }
  }
  return {
    id,
    path: file,
    cwd,
    name,
    firstMessage,
    modified: modified.toISOString(),
    messageCount,
    archived,
    parentSession,
  };
}

// ── Subagent sessions (@tintinweb/pi-subagents persists them as normal sessions) ──
const SUBAGENT_NAME = /^(.+)#[0-9a-f]{6,}$/i;
const RUNNING_FRESH_MS = 15_000;
/** A transcript without a final answer that stopped changing this long ago is considered stopped. */
const RUNNING_STALE_MS = 30 * 60_000;
const FINAL_STOP = new Set(["stop", "length", "error", "aborted"]);

/**
 * Parse a session JSONL into display messages + subagent status.
 * @param {string} raw @param {Date | number} mtime
 */
export function parseTranscript(raw, mtime, now = Date.now()) {
  const messages = [];
  let description = "";
  let last;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // partially written trailing line
    }
    if (e.type !== "message" || !e.message || e.message.role === "system") continue;
    messages.push(e.message);
    last = e.message;
    if (!description && e.message.role === "user") {
      description = textOf(e.message.content).trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 140);
    }
  }
  const age = now - new Date(mtime).getTime();
  const finished = last?.role === "assistant" && FINAL_STOP.has(last.stopReason);
  const running = age < RUNNING_FRESH_MS || (!finished && age < RUNNING_STALE_MS);
  return { messages, description, status: running ? "running" : "done" };
}

/**
 * Mark subagent children (rows with parentSession + subagent-style name) and resolve
 * their parent's session id. Orphans whose parent isn't listed stay top-level.
 * @param {Array<Record<string, any>>} rows
 */
export async function annotateSubagents(rows) {
  const byPath = new Map(rows.filter((r) => r.path).map((r) => [path.resolve(r.path), r]));
  const byFileId = new Map(
    rows.filter((r) => r.path).map((r) => [path.basename(r.path, ".jsonl").split("_").pop(), r]),
  );
  for (const r of rows) {
    const ps = r.parentSession;
    const m = typeof r.name === "string" ? SUBAGENT_NAME.exec(r.name) : null;
    if (!ps || !m || !r.path) continue;
    const parent =
      byPath.get(path.resolve(ps)) ?? byFileId.get(path.basename(ps, ".jsonl").split("_").pop());
    if (!parent || parent === r) continue;
    let description = "";
    let status = "done";
    try {
      const [raw, st] = await Promise.all([readFile(r.path, "utf8"), stat(r.path)]);
      ({ description, status } = parseTranscript(raw, st.mtime));
    } catch {
      /* keep defaults */
    }
    r.parentId = parent.id;
    r.subagent = { type: m[1], description, status };
  }
  return rows;
}

/** Read-only transcript for the web viewer. @param {string} p */
export async function readTranscript(p) {
  const v = validateStoredPath(p);
  const [raw, st] = await Promise.all([readFile(v.path, "utf8"), stat(v.path)]);
  const t = parseTranscript(raw, st.mtime);
  return { ...t, modified: st.mtime.toISOString() };
}

/** @param {boolean} archived */
export async function listStored(archived) {
  const r = roots();
  const files = await jsonlFiles(archived ? r.archive : r.live);
  const items = [];
  for (const f of files) {
    try {
      items.push(await summarize(f, archived));
    } catch {
      /* skip unreadable */
    }
  }
  items.sort((a, b) => b.modified.localeCompare(a.modified));
  await annotateSubagents(items);
  return items;
}

/** @param {string} p @param {boolean} toArchive */
export async function moveStored(p, toArchive) {
  const v = validateStoredPath(p);
  if (v.archived === toArchive) {
    const e = new Error(toArchive ? "Already archived" : "Not archived");
    // @ts-expect-error
    e.status = 400;
    throw e;
  }
  const r = roots();
  const dest = path.join(toArchive ? r.archive : r.live, v.rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await rename(v.path, dest);
  return { path: dest, archived: toArchive };
}

/** @param {string} p */
export async function deleteStored(p) {
  const v = validateStoredPath(p);
  await unlink(v.path);
  return { ok: true };
}
