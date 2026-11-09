<script lang="ts">
  import { getCapabilities, type AgentType } from "$lib/api";
  import { getAgent, setAgent } from "$lib/agent-selection.svelte";
  import { tr } from "$lib/i18n.svelte";
  import X from "@lucide/svelte/icons/x";

  type Props = { sessionId?: string; disabled?: boolean };
  let { sessionId = "", disabled = false }: Props = $props();

  let agents = $state<AgentType[]>([]);

  $effect(() => {
    const id = sessionId;
    agents = [];
    if (!id) return;
    let cancelled = false;
    getCapabilities(id)
      .then((c) => {
        if (!cancelled) agents = c.agents ?? [];
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  const selected = $derived(getAgent(sessionId));
  const first = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).slice(0, 90);
  const title = $derived(
    agents.find((a) => a.name === selected)?.description ?? tr("Auto (main model decides)"),
  );

  function onChange(e: Event) {
    setAgent(sessionId, (e.currentTarget as HTMLSelectElement).value);
  }
</script>

{#if sessionId && agents.length > 0}
  <div class="flex items-center gap-0.5">
    <select
      class="h-7 min-w-0 max-w-[12rem] rounded-full border-0 px-2.5 text-[11px] font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 {selected
        ? 'bg-primary/15 text-primary'
        : 'bg-muted/70 dark:bg-muted/40'}"
      value={selected}
      {disabled}
      onchange={onChange}
      {title}
      aria-label={tr("Subagent")}
    >
      <option value="">{tr("Subagent")}: {tr("Auto")}</option>
      {#each agents as a (a.name)}
        <option value={a.name}>
          {a.name}{a.model ? ` · ${a.model}` : ""} — {first(a.description)}
        </option>
      {/each}
    </select>
    {#if selected}
      <button
        type="button"
        class="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        onclick={() => setAgent(sessionId, "")}
        title={tr("Reset to Auto")}
        aria-label={tr("Reset to Auto")}
      >
        <X class="size-3" />
      </button>
    {/if}
  </div>
{/if}
