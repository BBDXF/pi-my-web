/**
 * Parse the `Agent` tool description built by @tintinweb/pi-subagents into
 * [{ name, description, model?, tools? }]. Lines look like:
 *   - Explore: Fast read-only search agent ... (claude-sonnet-5.5) (Tools: read, bash)
 * The list sits between "Available agent types" and the next blank line.
 * @param {unknown} text
 * @returns {{ name: string; description: string; model?: string; tools?: string }[]}
 */
export function parseAgentTypes(text) {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex((l) => /available agent types/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      if (out.length) break;
      continue;
    }
    const m = line.match(/^-\s+([^:\s][^:]*?):\s+(.*)$/);
    if (!m) {
      if (out.length) break;
      continue;
    }
    let rest = m[2].trim();
    let tools;
    let model;
    const tm = rest.match(/\s*\(Tools:\s*([^)]*)\)\s*$/);
    if (tm) {
      tools = tm[1].trim();
      rest = rest.slice(0, tm.index).trim();
    }
    const mm = rest.match(/\s*\(([^()\s]+)\)\s*$/);
    if (mm) {
      model = mm[1];
      rest = rest.slice(0, mm.index).trim();
    }
    out.push({
      name: m[1].trim(),
      description: rest,
      ...(model ? { model } : {}),
      ...(tools ? { tools } : {}),
    });
  }
  return out;
}
