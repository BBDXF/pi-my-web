import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "pigui-st-"));
process.env.PI_GUI_SESSIONS_DIR = join(tmp, "sessions");
process.env.PI_GUI_ARCHIVE_DIR = join(tmp, "archive");
const { createServer } = await import("./http.js");
const { validateStoredPath } = await import("./stored-sessions.js");

const file = join(tmp, "sessions", "--x--", "a.jsonl");
mkdirSync(join(tmp, "sessions", "--x--"), { recursive: true });
writeFileSync(
  file,
  [
    { type: "session", id: "abc", cwd: "/x" },
    { type: "message", message: { role: "user", content: "hello" } },
    { type: "message", message: { role: "assistant", content: [] } },
    { type: "session_info", name: "N" },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n",
);

describe("auth + stored sessions", () => {
  let app, base;
  before(async () => {
    app = createServer({ port: 0, password: "pw" });
    await new Promise((r) => app.listen(r));
    base = `http://127.0.0.1:${app.server.address().port}`;
  });
  after(async () => {
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
  });
  const post = (p, body, h = {}) =>
    fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });

  it("requires auth", async () => {
    assert.equal((await fetch(base + "/api/sessions/stored")).status, 401);
    const st = await (await fetch(base + "/api/auth/status")).json();
    assert.deepEqual(st, { required: true, authenticated: false });
    assert.equal((await post("/api/auth/login", { password: "no" })).status, 401);
  });

  it("login, list, archive, unarchive, delete", async () => {
    const r = await post("/api/auth/login", { password: "pw" });
    assert.equal(r.status, 200);
    const sc = r.headers.get("set-cookie");
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    const h = { cookie: sc.split(";")[0] };
    const st = await (await fetch(base + "/api/auth/status", { headers: h })).json();
    assert.equal(st.authenticated, true);

    let l = await (await fetch(base + "/api/sessions/stored?archived=0", { headers: h })).json();
    assert.equal(l.sessions.length, 1);
    assert.equal(l.sessions[0].id, "abc");
    assert.equal(l.sessions[0].name, "N");
    assert.equal(l.sessions[0].firstMessage, "hello");
    assert.equal(l.sessions[0].messageCount, 2);

    assert.equal((await post("/api/sessions/stored/archive", { path: file }, h)).status, 200);
    assert.ok(!existsSync(file));
    l = await (await fetch(base + "/api/sessions/stored?archived=1", { headers: h })).json();
    assert.equal(l.sessions[0].archived, true);
    const ap = l.sessions[0].path;
    assert.equal((await post("/api/sessions/stored/unarchive", { path: ap }, h)).status, 200);
    assert.ok(existsSync(file));
    const d = await fetch(base + "/api/sessions/stored", { method: "DELETE", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ path: file }) });
    assert.equal(d.status, 200);
    assert.ok(!existsSync(file));

    await post("/api/auth/logout", {}, h);
    assert.equal((await fetch(base + "/api/sessions/stored", { headers: h })).status, 401);
  });

  it("rejects paths outside roots", () => {
    for (const p of ["/etc/passwd", join(tmp, "sessions", "..", "x.jsonl"), join(tmp, "sessions"), "", null, join(tmp, "sessions", "--x--", "a.txt")])
      assert.throws(() => validateStoredPath(p));
  });
});
