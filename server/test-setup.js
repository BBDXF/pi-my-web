// Preloaded by `npm test` (node --import): isolate pi agent dir so tests never touch ~/.pi/agent.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (!process.env.PI_TEST_KEEP_AGENT_DIR) {
  process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-my-web-agent-"));
}
