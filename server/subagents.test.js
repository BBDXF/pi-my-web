import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agent = process.env.PI_CODING_AGENT_DIR || mkdtempSync(join(tmpdir(), "pigui-sub-"));
process.env.PI_CODING_AGENT_DIR = agent;
delete process.env.PI_GUI_SESSIONS_DIR;
delete process.env.PI_MY_WEB_SESSIONS_DIR;
const { listStored, readTranscript, parseTranscript } = await import("./stored-sessions.js");

const dir = join(agent, "sessions", "--proj--");
const parentFile = join(dir, "2026-01-01T00-00-00-000Z_parent-1.jsonl");
const lines = (a) => a.map((e) => JSON.stringify(e)).join("\n") + "\n";
const u = (t) => ({ type: "message", message: { role: "user", content: [{ type: "text", text: t }] } });
const a = (stop) => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: stop } });
const child = (id, name, extra = []) => [
  { type: "session", id, cwd: "/proj", parentSession: parentFile },
  { type: "session_info", name },
  u("Investigate the thing\nmore detail"),
  ...extra,
];

describe("subagent sessions", () => {
  before(() => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(parentFile, lines([{ type: "session", id: "parent-1", cwd: "/proj" }, u("hi")]));
    writeFileSync(join(dir, "c-done.jsonl"), lines(child("c-done", "Explore#abcdef12", [a("stop")])));
    writeFileSync(join(dir, "c-run.jsonl"), lines(child("c-run", "general-purpose#12345678", [a("toolUse")])));
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(dir, "c-done.jsonl"), old, old);
    // fork: has parentSession but ordinary name -> stays top-level
    writeFileSync(join(dir, "fork.jsonl"), lines([{ type: "session", id: "fork", cwd: "/proj", parentSession: parentFile }, u("fork")]));
  });
  after(() => rmSync(agent, { recursive: true, force: true }));

  it("resolves parent id, type, description and status", async () => {
    const rows = await listStored(false);
    const parent = rows.find((r) => r.id === "parent-1");
    assert.equal(parent.parentId, undefined);
    const done = rows.find((r) => r.id === "c-done");
    assert.equal(done.parentId, "parent-1");
    assert.deepEqual(done.subagent, { type: "Explore", description: "Investigate the thing", status: "done" });
    const run = rows.find((r) => r.id === "c-run");
    assert.equal(run.parentId, "parent-1");
    assert.equal(run.subagent.type, "general-purpose");
    assert.equal(run.subagent.status, "running");
    assert.equal(rows.find((r) => r.id === "fork").parentId, undefined);
  });

  it("reads a transcript, skipping system messages and partial lines", async () => {
    const f = join(dir, "c-partial.jsonl");
    writeFileSync(f, lines(child("c-partial", "x#abcdef12", [{ type: "message", message: { role: "system", content: "" } }, a("stop")])) + '{"type":"mess');
    const t = await readTranscript(f);
    assert.deepEqual(t.messages.map((m) => m.role), ["user", "assistant"]);
    await assert.rejects(readTranscript("/etc/passwd"));
  });

  it("marks stale unfinished transcripts as done", () => {
    const t = parseTranscript(lines(child("z", "x#abcdef12", [a("toolUse")])), Date.now() - 2 * 3600_000);
    assert.equal(t.status, "done");
  });
});
