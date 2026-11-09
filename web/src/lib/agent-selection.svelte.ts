/** Per-session subagent choice for the composer ("" = Auto). Persisted in sessionStorage. */
const sel = $state<Record<string, string>>({});
const key = (id: string) => `pi-agent:${id}`;

export function getAgent(id: string | undefined): string {
  if (!id) return "";
  // Read-only: called inside $derived, so it must not write $state.
  if (id in sel) return sel[id];
  try {
    return sessionStorage.getItem(key(id)) ?? "";
  } catch {
    return "";
  }
}

export function setAgent(id: string, name: string) {
  sel[id] = name;
  try {
    if (name) sessionStorage.setItem(key(id), name);
    else sessionStorage.removeItem(key(id));
  } catch {
    /* ignore */
  }
}

export function withAgent(id: string, text: string): string {
  const name = getAgent(id);
  if (!name || !text.trim()) return text;
  return `Use the Agent tool with subagent_type "${name}" for this task.\n\n${text}`;
}
