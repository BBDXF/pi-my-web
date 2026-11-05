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

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/**
 * Sum token usage over assistant messages and count tool calls / errors.
 * @param {Array<any>} messages
 * @param {Array<{name: string, description?: string}> | null} available tool set recorded in the session (system message)
 * @param {(provider: string, id: string) => number | undefined} [contextWindowFor]
 */
export function aggregateTranscript(messages, available = null, contextWindowFor) {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, hasCost: false };
  /** @type {Map<string, {provider: string, id: string, turns: number}>} */
  const models = new Map();
  const calls = new Map(); // name -> {calls, errors}
  const nameById = new Map();
  const bump = (name) => calls.get(name) ?? calls.set(name, { name, calls: 0, errors: 0 }).get(name);
  let last;
  for (const m of messages) {
    if (m.role === "assistant") {
      const u = m.usage;
      if (u) {
        usage.input += num(u.input);
        usage.output += num(u.output);
        usage.cacheRead += num(u.cacheRead);
        usage.cacheWrite += num(u.cacheWrite);
        const turn = num(u.totalTokens) || num(u.input) + num(u.output) + num(u.cacheRead) + num(u.cacheWrite);
        usage.total += turn;
        const c = typeof u.cost === "number" ? u.cost : u.cost?.total;
        if (typeof c === "number") {
          usage.cost += c;
          usage.hasCost = true;
        }
        last = { provider: m.provider, id: m.model, turn };
      }
      if (m.model) {
        const k = `${m.provider ?? ""}/${m.model}`;
        const e = models.get(k) ?? models.set(k, { provider: m.provider ?? "", id: m.model, turns: 0 }).get(k);
        e.turns++;
      }
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part?.type === "toolCall" && part.name) {
            bump(part.name).calls++;
            if (part.id) nameById.set(part.id, part.name);
          }
        }
      }
    } else if (m.role === "toolResult" && m.isError) {
      const name = m.toolName || nameById.get(m.toolCallId);
      if (name) bump(name).errors++;
    }
  }
  const win = last && contextWindowFor ? contextWindowFor(last.provider, last.id) : undefined;
  return {
    usage: {
      input: usage.input,
      output: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      total: usage.total,
      cost: usage.hasCost ? usage.cost : null,
      models: [...models.values()],
      contextTokens: last?.turn ?? null,
      contextWindow: win ?? null,
      percent: win && last ? (last.turn / win) * 100 : null,
    },
    tools: {
      used: [...calls.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
      available,
    },
  };
}

/**
 * Parse a session JSONL into display messages + subagent status + usage/tools.
 * @param {string} raw @param {Date | number} mtime
 */
export function parseTranscript(raw, mtime, now = Date.now(), contextWindowFor) {
  const p = parseRaw(raw);
  return finish(p, mtime, now, contextWindowFor);
}

function parseRaw(raw) {
  const messages = [];
  let description = "";
  let last;
  let available = null;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // partially written trailing line
    }
    if (e.type !== "message" || !e.message) continue;
    if (e.message.role === "system") {
      if (Array.isArray(e.message.toolsAdded) && !available) {
        available = e.message.toolsAdded
          .filter((x) => x?.name)
          .map((x) => ({ name: x.name, description: String(x.description ?? "").split("\n")[0].slice(0, 160) }));
      }
      continue;
    }
    messages.push(e.message);
    last = e.message;
    if (!description && e.message.role === "user") {
      description = textOf(e.message.content).trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 140);
    }
  }
  const finished = last?.role === "assistant" && FINAL_STOP.has(last.stopReason);
  return { messages, description, finished, available, agg: null };
}

function finish(p, mtime, now, contextWindowFor) {
  const age = now - new Date(mtime).getTime();
  const running = age < RUNNING_FRESH_MS || (!p.finished && age < RUNNING_STALE_MS);
  p.agg ??= aggregateTranscript(p.messages, p.available);
  const agg = contextWindowFor ? aggregateTranscript(p.messages, p.available, contextWindowFor) : p.agg;
  return {
    messages: p.messages,
    description: p.description,
    status: running ? "running" : "done",
    usage: agg.usage,
    tools: agg.tools,
  };
}

/** mtime+size keyed parse cache so the sidebar list stays cheap. */
const parseCache = new Map();
async function readParsed(file) {
  const st = await stat(file);
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = parseCache.get(file);
  if (hit?.key === key) return { p: hit.p, mtime: st.mtime };
  const p = parseRaw(await readFile(file, "utf8"));
  p.agg = aggregateTranscript(p.messages, p.available);
  parseCache.delete(file);
  parseCache.set(file, { key, p });
  if (parseCache.size > 400) parseCache.delete(parseCache.keys().next().value);
  return { p, mtime: st.mtime };
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
  let tokens = 0;
  try {
    const { p, mtime } = await readParsed(r.path);
    const f = finish(p, mtime, Date.now());
    ({ description, status } = f);
    tokens = f.usage.total;
  } catch {
    /* keep defaults */
  }
  return { type: m[1], description, status, tokens };
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
export async function readTranscript(p, contextWindowFor) {
  const v = validateStoredPath(p);
  const { p: parsed, mtime } = await readParsed(v.path);
  const t = finish(parsed, mtime, Date.now(), contextWindowFor);
  return { ...t, modified: mtime.toISOString() };
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
