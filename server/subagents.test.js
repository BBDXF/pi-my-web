import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agent = process.env.PI_CODING_AGENT_DIR || mkdtempSync(join(tmpdir(), "pigui-sub-"));
process.env.PI_CODING_AGENT_DIR = agent;
delete process.env.PI_GUI_SESSIONS_DIR;
delete process.env.PI_MY_WEB_SESSIONS_DIR;
const { listStored, readTranscript, parseTranscript, aggregateTranscript, moveStored, deleteStored, cleanupSubagents } = await import("./stored-sessions.js");

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
    assert.deepEqual(done.subagent, { type: "Explore", description: "Investigate the thing", status: "done", tokens: 0 });
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

  it("cascades archive/unarchive, keeps id-based nesting in the archive, refuses running", async () => {
    // c-run is fresh+unfinished => running => blocks the parent
    await assert.rejects(moveStored(parentFile, true), (e) => e.status === 409);
    await assert.rejects(moveStored(join(dir, "c-run.jsonl"), true), (e) => e.status === 409);
    await assert.rejects(deleteStored(parentFile), (e) => e.status === 409);
    assert.ok(existsSync(parentFile) && existsSync(join(dir, "c-done.jsonl")));
    // finish c-run; drop the partial-line fixture from the previous test
    rmSync(join(dir, "c-partial.jsonl"), { force: true });
    const old = new Date(Date.now() - 3600_000);
    writeFileSync(join(dir, "c-run.jsonl"), lines(child("c-run", "general-purpose#12345678", [a("stop")])));
    utimesSync(join(dir, "c-run.jsonl"), old, old);

    const r = await moveStored(parentFile, true);
    assert.equal(r.subagents, 2);
    assert.equal(r.moved.length, 3);
    assert.ok(!existsSync(join(dir, "c-done.jsonl")));
    const arch = await listStored(true);
    assert.equal(arch.find((x) => x.id === "c-done").parentId, "parent-1");
    assert.equal(arch.find((x) => x.id === "c-run").parentId, "parent-1");
    assert.equal((await listStored(false)).some((x) => x.parentId), false);

    const back = await moveStored(r.path, false);
    assert.equal(back.moved.length, 3);
    assert.ok(existsSync(join(dir, "c-done.jsonl")) && existsSync(parentFile));
  });

  it("cleans up finished subagents only, then deletes parent with children", async () => {
    writeFileSync(join(dir, "c-live.jsonl"), lines(child("c-live", "Plan#99999999", [a("toolUse")])));
    const c = await cleanupSubagents(parentFile);
    assert.equal(c.deleted.length, 2);
    assert.equal(c.skipped, 1);
    assert.ok(existsSync(parentFile) && existsSync(join(dir, "c-live.jsonl")));
    await assert.rejects(deleteStored(parentFile), (e) => e.status === 409);
    const old = new Date(Date.now() - 3600_000);
    writeFileSync(join(dir, "c-live.jsonl"), lines(child("c-live", "Plan#99999999", [a("stop")])));
    utimesSync(join(dir, "c-live.jsonl"), old, old);
    const d = await deleteStored(parentFile);
    assert.equal(d.deleted.length, 2);
    assert.ok(!existsSync(join(dir, "c-live.jsonl")));
  });

  it("aggregates usage, models, context % and tool calls/errors", () => {
    const asst = (model, u, parts) => ({ role: "assistant", provider: "p", model, stopReason: "stop", content: parts, usage: u });
    const msgs = [
      { role: "user", content: "x" },
      asst("m1", { input: 10, output: 5, cacheRead: 100, cacheWrite: 20, totalTokens: 135, cost: { total: 0.5 } }, [
        { type: "toolCall", id: "a", name: "read" },
        { type: "toolCall", id: "b", name: "bash" },
      ]),
      { role: "toolResult", toolCallId: "a", toolName: "read", isError: false },
      { role: "toolResult", toolCallId: "b", isError: true },
      asst("m2", { input: 1, output: 1 }, [{ type: "toolCall", id: "c", name: "read" }, { type: "text", text: "done" }]),
    ];
    const r = aggregateTranscript(msgs, [{ name: "read" }], (p, id) => (id === "m2" ? 1000 : undefined));
    assert.equal(r.usage.input, 11);
    assert.equal(r.usage.cacheRead, 100);
    assert.equal(r.usage.total, 137); // 135 + (1+1 fallback sum)
    assert.equal(r.usage.cost, 0.5);
    assert.deepEqual(r.usage.models.map((m) => [m.id, m.turns]), [["m1", 1], ["m2", 1]]);
    assert.equal(r.usage.contextTokens, 2);
    assert.equal(r.usage.percent, 0.2);
    assert.deepEqual(r.tools.used, [
      { name: "read", calls: 2, errors: 0 },
      { name: "bash", calls: 1, errors: 1 },
    ]);
    assert.deepEqual(r.tools.available, [{ name: "read" }]);
    assert.equal(aggregateTranscript([]).usage.cost, null);
  });

  it("reports tokens on list rows and the recorded tool set in the transcript", async () => {
    const f = join(dir, "c-tools.jsonl");
    writeFileSync(parentFile, lines([{ type: "session", id: "parent-1", cwd: "/proj" }, u("hi")]));
    writeFileSync(f, lines([
      { type: "session", id: "c-tools", cwd: "/proj", parentSession: parentFile },
      { type: "session_info", name: "Explore#deadbeef" },
      { type: "message", message: { role: "system", content: "", toolsAdded: [{ name: "grep", description: "Search\nmore" }] } },
      u("go"),
      { type: "message", message: { role: "assistant", stopReason: "stop", model: "m", provider: "p", usage: { input: 3, output: 4, totalTokens: 7 }, content: [{ type: "toolCall", id: "t", name: "grep" }] } },
    ]));
    const row = (await listStored(false)).find((x) => x.id === "c-tools");
    assert.equal(row.subagent.tokens, 7);
    const t = await readTranscript(f, (p, id) => (id === "m" ? 70 : undefined));
    assert.deepEqual(t.tools.available, [{ name: "grep", description: "Search" }]);
    assert.equal(t.usage.percent, 10);
    assert.equal(t.tools.used[0].calls, 1);
  });
});
