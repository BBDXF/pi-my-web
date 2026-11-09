import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UiRequests } from "./ui-requests.js";

const mk = () => {
  const events = [];
  return { events, ui: new UiRequests((e) => events.push(e)) };
};

describe("UiRequests", () => {
  it("select responds with value", async () => {
    const { ui, events } = mk();
    const p = ui.overrides().select("T", ["a", "b"]);
    assert.equal(events[0].type, "extension_ui_request");
    assert.deepEqual(events[0].options, ["a", "b"]);
    assert.equal(ui.list().length, 1);
    assert.equal(ui.respond(events[0].id, { value: "b" }), true);
    assert.equal(await p, "b");
    assert.equal(ui.respond(events[0].id, { value: "b" }), false);
    assert.equal(ui.list().length, 0);
  });
  it("cancel: confirm false, others undefined", async () => {
    const { ui, events } = mk();
    const c = ui.overrides().confirm("T", "m");
    const i = ui.overrides().input("T", "ph");
    ui.respond(events[0].id, { cancelled: true });
    ui.respond(events[1].id, { cancelled: true });
    assert.equal(await c, false);
    assert.equal(await i, undefined);
  });
  it("confirm true", async () => {
    const { ui, events } = mk();
    const c = ui.overrides().confirm("T", "m");
    ui.respond(events[0].id, { value: true });
    assert.equal(await c, true);
  });
  it("timeout dismisses", async () => {
    const { ui, events } = mk();
    const p = ui.overrides().editor("T", "x");
    const q = ui.overrides().select("T", ["a"], { timeout: 20 });
    assert.equal(await q, undefined);
    assert.equal(events.at(-1).type, "extension_ui_dismiss");
    assert.equal(ui.list().length, 1);
    ui.cancelAll();
    assert.equal(await p, undefined);
  });
  it("abort signal dismisses", async () => {
    const { ui, events } = mk();
    const ac = new AbortController();
    const p = ui.overrides().confirm("T", "m", { signal: ac.signal });
    ac.abort();
    assert.equal(await p, false);
    assert.deepEqual(events.at(-1), { type: "extension_ui_dismiss", id: events[0].id });
  });
});
