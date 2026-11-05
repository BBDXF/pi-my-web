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

/** Session id embedded in a pi session filename (`<timestamp>_<id>.jsonl`). @param {string} p */
export function fileSessionId(p) {
  return path.basename(p, ".jsonl").split("_").pop() || "";
}

/** Subagent info for one summary (no parent lookup). Null if it isn't a subagent session. */
async function subagentOf(r) {
  const m = typeof r.name === "string" ? SUBAGENT_NAME.exec(r.name) : null;
  if (!r.parentSession || !m || !r.path) return null;
  let description = "";
  let status = "done";
  try {
    const [raw, st] = await Promise.all([readFile(r.path, "utf8"), stat(r.path)]);
    ({ description, status } = parseTranscript(raw, st.mtime));
  } catch {
    /* keep defaults */
  }
  return { type: m[1], description, status };
}

/**
 * Mark subagent children and resolve their parent's session id by id (not path),
 * so links survive archive moves. Orphans whose parent isn't listed stay top-level.
 * @param {Array<Record<string, any>>} rows
 */
export async function annotateSubagents(rows) {
  const byId = new Map();
  for (const r of rows) {
    byId.set(r.id, r);
    if (r.path) byId.set(fileSessionId(r.path), r);
  }
  for (const r of rows) {
    if (!r.parentSession) continue;
    const parent = byId.get(fileSessionId(r.parentSession));
    if (!parent || parent === r) continue;
    const sub = await subagentOf(r);
    if (!sub) continue;
    r.parentId = parent.id;
    r.subagent = sub;
  }
  return rows;
}

function httpError(status, message) {
  const e = new Error(message);
  // @ts-expect-error
  e.status = status;
  return e;
}

/**
 * Subagent children of the session file `p`, found in the same root (live or archive).
 * @param {string} p @returns {Promise<Array<{ path: string, id: string, subagent: any }>>}
 */
export async function childrenOfStored(p) {
  const v = validateStoredPath(p);
  const r = roots();
  const files = await jsonlFiles(v.archived ? r.archive : r.live);
  const parentFileId = fileSessionId(v.path);
  const parentHeaderId = await summarize(v.path, v.archived).then((x) => x.id).catch(() => parentFileId);
  const out = [];
  for (const f of files) {
    if (f === v.path) continue;
    const sum = await summarize(f, v.archived).catch(() => null);
    if (!sum?.parentSession) continue;
    const pid = fileSessionId(sum.parentSession);
    if (pid !== parentFileId && pid !== parentHeaderId) continue;
    const sub = await subagentOf(sum);
    if (sub) out.push({ path: f, id: sum.id, subagent: sub });
  }
  return out;
}

/** Throws 409 if the file itself is a running subagent. @param {string} p */
async function assertNotRunning(p) {
  const v = validateStoredPath(p);
  const sum = await summarize(v.path, v.archived);
  const sub = await subagentOf(sum);
  if (sub?.status === "running") throw httpError(409, "Subagent is still running");
}

/** Children list; 409 if any is still running. @param {string} p */
async function childrenOrBlock(p) {
  const kids = await childrenOfStored(p);
  const running = kids.filter((k) => k.subagent.status === "running").length;
  if (running) throw httpError(409, `${running} subagent${running > 1 ? "s are" : " is"} still running`);
  return kids;
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

/** @param {string} from @param {string} to */
async function moveFile(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
}

/**
 * Archive / restore a session. A parent also moves its subagents (same relative dir);
 * all-or-nothing: a failure rolls earlier moves back.
 * @param {string} p @param {boolean} toArchive
 */
export async function moveStored(p, toArchive) {
  const v = validateStoredPath(p);
  if (v.archived === toArchive) throw httpError(400, toArchive ? "Already archived" : "Not archived");
  await assertNotRunning(v.path);
  const kids = await childrenOrBlock(v.path);
  const r = roots();
  const dest = (rel) => path.join(toArchive ? r.archive : r.live, rel);
  const plan = [...kids.map((k) => k.path), v.path].map((from) => {
    const rel = path.relative(v.archived ? r.archive : r.live, from);
    return { from, to: dest(rel) };
  });
  const done = [];
  try {
    for (const m of plan) {
      await moveFile(m.from, m.to);
      done.push(m);
    }
  } catch (e) {
    for (const m of done.reverse()) await moveFile(m.to, m.from).catch(() => {});
    throw e;
  }
  return {
    path: dest(v.rel),
    archived: toArchive,
    moved: plan.map((m) => ({ path: m.to, archived: toArchive })),
    subagents: kids.length,
  };
}

/** Delete a session and its subagents. @param {string} p */
export async function deleteStored(p) {
  const v = validateStoredPath(p);
  await assertNotRunning(v.path);
  const kids = await childrenOrBlock(v.path);
  const deleted = [];
  for (const f of [...kids.map((k) => k.path), v.path]) {
    await unlink(f);
    deleted.push(f);
  }
  return { ok: true, deleted, subagents: kids.length };
}

/** Delete finished subagents of a session, keep the parent. Running ones are skipped. @param {string} p */
export async function cleanupSubagents(p) {
  const v = validateStoredPath(p);
  const kids = await childrenOfStored(v.path);
  const deleted = [];
  let skipped = 0;
  for (const k of kids) {
    if (k.subagent.status === "running") {
      skipped++;
      continue;
    }
    await unlink(k.path);
    deleted.push(k.path);
  }
  return { ok: true, deleted, skipped };
}
