import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAgentTypes } from "./agent-types.js";

const DESC = `Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types and the tools they have access to:
- general-purpose: General-purpose agent for researching complex questions. When you are searching for a keyword use this agent. (claude-sonnet-5.5) (Tools: *)
- Explore: Fast read-only search agent for locating code. Use it to find files by pattern (eg. "src/components/**/*.tsx"), grep for symbols. (claude-sonnet-5.5) (Tools: read, bash, grep, find, ls)
- reviewer: Read-only code reviewer. (claude-opus-5.5) (Tools: read, grep, find, ls, bash)
- nomodel: Agent without model info. (Tools: read)

Custom agents can be defined in .pi/agents/<name>.md — they are picked up automatically.

## When not to use
- Not: an agent
`;

describe("parseAgentTypes", () => {
  it("parses names, models, tools and stops at the blank line", () => {
    const a = parseAgentTypes(DESC);
    assert.deepEqual(a.map((x) => x.name), ["general-purpose", "Explore", "reviewer", "nomodel"]);
    assert.equal(a[0].model, "claude-sonnet-5.5");
    assert.equal(a[0].tools, "*");
    assert.equal(a[1].tools, "read, bash, grep, find, ls");
    assert.ok(a[1].description.endsWith("grep for symbols."));
    assert.equal(a[2].model, "claude-opus-5.5");
    assert.equal(a[3].model, undefined);
    assert.equal(a[3].description, "Agent without model info.");
  });
  it("returns [] for unrelated text", () => {
    assert.deepEqual(parseAgentTypes("hello"), []);
    assert.deepEqual(parseAgentTypes(undefined), []);
  });
});
