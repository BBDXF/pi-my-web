<script lang="ts">
  import { onMount } from "svelte";
  import { getSubagentTranscript, isPairedToolResult, messageKey } from "$lib/api";
  import type { ChatMessage, SessionRow, SubagentTools, SubagentUsage } from "$lib/api";
  import MessageBubble from "$lib/components/MessageBubble.svelte";
  import { t, i18n } from "$lib/i18n.svelte";
  import { relativeTime, fmtTokens } from "$lib/utils";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Wrench from "@lucide/svelte/icons/wrench";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Bot from "@lucide/svelte/icons/bot";
  import Lock from "@lucide/svelte/icons/lock";
  import PanelLeft from "@lucide/svelte/icons/panel-left";

  type Props = {
    session: SessionRow;
    parent?: SessionRow;
    parentTitle: string;
    onOpenParent: () => void;
    /** Transcript status changed — let the sidebar refresh. */
    onStatus?: () => void;
    showExpandSidebar?: boolean;
    onExpandSidebar?: () => void;
  };
  let { session, parent, parentTitle, onOpenParent, onStatus, showExpandSidebar = false, onExpandSidebar }: Props = $props();

  let messages = $state<ChatMessage[]>([]);
  let status = $state<"running" | "done">(session.subagent?.status ?? "done");
  let modified = $state<string | undefined>(undefined);
  let usage = $state<SubagentUsage | null>(null);
  let tools = $state<SubagentTools | null>(null);
  let usageOpen = $state(false);
  let toolsOpen = $state(false);
  let error = $state<string | null>(null);
  let loaded = $state(false);
  let scroller: HTMLDivElement | undefined = $state();
  let stick = true;

  async function load(path: string) {
    try {
      const r = await getSubagentTranscript(path);
      if (path !== session.path) return;
      const changed = r.messages.length !== messages.length || r.status !== status;
      const statusChanged = r.status !== status;
      messages = r.messages;
      status = r.status;
      modified = r.modified;
      usage = r.usage ?? null;
      tools = r.tools ?? null;
      error = null;
      if (statusChanged) onStatus?.();
      if (changed && stick) queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loaded = true;
    }
  }

  // Reload on switching child; poll every 2s while running, 10s afterwards (cheap catch-up).
  $effect(() => {
    const path = session.path;
    if (!path) return;
    messages = [];
    usage = null;
    tools = null;
    loaded = false;
    stick = true;
    status = session.subagent?.status ?? "done";
    let timer = 0;
    let dead = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await load(path);
      if (!dead) timer = window.setTimeout(tick, status === "running" ? 2000 : 10_000);
    };
    void tick();
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  });

  function onScroll() {
    if (!scroller) return;
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  const fmtCost = (c: number | null) => (c == null ? "—" : c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(3)}`);
  const pct = $derived(usage?.percent ?? null);
  const nearLimit = $derived(pct != null && pct >= 80);
  const headline = $derived(
    usage
      ? [
          usage.contextTokens != null && usage.contextWindow
            ? `${fmtTokens(usage.contextTokens)} / ${fmtTokens(usage.contextWindow)}`
            : `${fmtTokens(usage.total)}`,
          pct != null ? `${Math.round(pct)}%` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "",
  );
  const usageRows = $derived(
    usage
      ? ([
          ["usage.input", fmtTokens(usage.input)],
          ["usage.output", fmtTokens(usage.output)],
          ["usage.cacheRead", fmtTokens(usage.cacheRead)],
          ["usage.cacheWrite", fmtTokens(usage.cacheWrite)],
          ["usage.total", fmtTokens(usage.total)],
          ["usage.cost", fmtCost(usage.cost)],
        ] as const)
      : [],
  );
  /** Recorded tool set (with call counts) if the file has one, else only tools actually called. */
  const toolRows = $derived.by(() => {
    if (!tools) return [];
    const used = new Map(tools.used.map((x) => [x.name, x]));
    const rows = (tools.available ?? []).map((a) => ({
      name: a.name,
      description: a.description ?? "",
      calls: used.get(a.name)?.calls ?? 0,
      errors: used.get(a.name)?.errors ?? 0,
    }));
    for (const u of tools.used) if (!rows.some((r) => r.name === u.name)) rows.push({ ...u, description: "" });
    return rows.sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  });
  const calledCount = $derived(tools?.used.length ?? 0);
  const errorCount = $derived(tools?.used.reduce((n, x) => n + x.errors, 0) ?? 0);
  const sub = $derived(session.subagent);
  const title = $derived(sub?.type ?? session.name ?? session.id.slice(0, 8));
</script>

<section class="chat-canvas flex min-h-0 flex-1 flex-col bg-background" data-subagent-view>
  <header class="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
    {#if showExpandSidebar && onExpandSidebar}
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={t("sidebar.expand")}
        title={t("sidebar.expand")}
        onclick={onExpandSidebar}
      >
        <PanelLeft class="size-4" />
      </button>
    {/if}
    <Bot class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span class="truncate">{title}</span>
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground"
        >
          <span
            class="size-1.5 rounded-full {status === 'running' ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}"
          ></span>
          {status === "running" ? t("sidebar.subagentRunning") : t("sidebar.subagentDone")}
        </span>
        {#if modified}
          <span class="shrink-0 text-[11px] font-normal text-muted-foreground">
            {relativeTime(modified, i18n.locale, t("time.now"))}
          </span>
        {/if}
      </div>
      <button
        type="button"
        class="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
        title={t("subagent.backToParent")}
        disabled={!parent}
        onclick={onOpenParent}
      >
        <ArrowLeft class="size-3 shrink-0" />
        <span class="truncate underline-offset-2 hover:underline">{t("subagent.of", { parent: parentTitle })}</span>
      </button>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      {#if tools}
        <div class="relative" role="group" aria-label={tools.available ? t("subagent.toolsAvail") : t("subagent.toolsUsed")}
          onmouseenter={() => (toolsOpen = true)} onmouseleave={() => (toolsOpen = false)}>
          <button
            type="button"
            data-subagent-tools
            class="inline-flex h-6 items-center gap-1 rounded-md border border-border/70 px-1.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted"
            aria-expanded={toolsOpen}
            onclick={() => (toolsOpen = !toolsOpen)}
          >
            <Wrench class="size-3" />
            <span class="hidden sm:inline">{calledCount}{tools.available ? `/${tools.available.length}` : ""} {t("caps.tools")}</span>
            {#if errorCount}<span class="text-destructive">· {errorCount}!</span>{/if}
          </button>
          {#if toolsOpen}
            <div class="absolute right-0 top-full z-40 pt-1.5">
              <div class="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
                <h4 class="mb-1 font-medium">
                  {tools.available ? t("subagent.toolsAvail") : t("subagent.toolsUsed")}
                  <span class="font-mono text-muted-foreground">{calledCount}{tools.available ? `/${tools.available.length}` : ""}</span>
                </h4>
                <ul class="max-h-[60vh] overflow-y-auto pr-1">
                  {#each toolRows as r (r.name)}
                    <li class="flex items-baseline gap-1.5 py-0.5 {r.calls ? '' : 'opacity-45'}" title={r.description || (r.calls ? "" : t("subagent.unused"))}>
                      <span class="size-1.5 shrink-0 rounded-full {r.errors ? 'bg-destructive' : r.calls ? 'bg-emerald-500' : 'bg-muted-foreground/50'}"></span>
                      <span class="min-w-0 flex-1 truncate font-mono">{r.name}</span>
                      {#if r.calls}
                        <span class="shrink-0 font-mono tabular-nums text-muted-foreground">{t("subagent.calls", { n: r.calls })}</span>
                      {/if}
                      {#if r.errors}
                        <span class="shrink-0 font-mono tabular-nums text-destructive">{t("subagent.errors", { n: r.errors })}</span>
                      {/if}
                    </li>
                  {:else}
                    <li class="text-muted-foreground">{t("subagent.noTools")}</li>
                  {/each}
                </ul>
              </div>
            </div>
          {/if}
        </div>
      {/if}
      {#if usage && usage.total > 0}
        <div class="relative" role="group" aria-label={t("status.usage")}
          onmouseenter={() => (usageOpen = true)} onmouseleave={() => (usageOpen = false)}>
          <button
            type="button"
            data-subagent-usage
            class="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted {nearLimit ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border/70'}"
            aria-expanded={usageOpen}
            onclick={() => (usageOpen = !usageOpen)}
          >
            <Gauge class="size-3" />
            <span>{headline}</span>
            {#if usage.cost != null}<span class="hidden opacity-70 sm:inline">· {fmtCost(usage.cost)}</span>{/if}
          </button>
          {#if usageOpen}
            <div class="absolute right-0 top-full z-40 pt-1.5">
              <div class="w-60 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
                {#if pct != null}
                  <div class="mb-1 flex items-baseline justify-between">
                    <span class="font-medium">{t("usage.context")}</span>
                    <span class="font-mono tabular-nums">{headline}</span>
                  </div>
                  <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full {nearLimit ? 'bg-amber-500' : 'bg-primary'}" style="width:{Math.min(100, Math.max(0, pct))}%"></div>
                  </div>
                {/if}
                <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                  {#each usageRows as [k, v] (k)}
                    <dt class="text-muted-foreground">{t(k)}</dt>
                    <dd class="text-right font-mono tabular-nums">{v}</dd>
                  {/each}
                  {#each usage.models as m (m.provider + m.id)}
                    <dt class="text-muted-foreground">{t("usage.model")}</dt>
                    <dd class="max-w-36 truncate text-right font-mono" title="{m.provider}/{m.id} · {t('usage.turns', { n: m.turns })}">{m.id}{usage.models.length > 1 ? ` ×${m.turns}` : ""}</dd>
                  {/each}
                </dl>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <div class="relative min-h-0 flex-1">
    <div bind:this={scroller} class="absolute inset-0 overflow-y-auto px-4 sm:px-8 lg:px-12" onscroll={onScroll}>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6">
        {#if error}
          <div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        {:else if loaded && messages.length === 0}
          <div class="py-10 text-center text-sm text-muted-foreground">{t("subagent.empty")}</div>
        {/if}
        {#each messages as m, i (messageKey(m, i))}
          {#if !(m.role === "toolResult" && isPairedToolResult(messages, i))}
            <MessageBubble
              message={m}
              {messages}
              index={i}
              readOnly
            />
          {/if}
        {/each}
        {#if status === "running"}
          <div class="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
            <span class="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true"></span>
            {t("subagent.live")}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <footer class="shrink-0 p-3">
    <div
      class="mx-auto flex w-full max-w-5xl items-start gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3.5 py-2.5 text-[13px] text-muted-foreground"
      role="note"
    >
      <Lock class="mt-0.5 size-3.5 shrink-0" />
      <span>{t("subagent.readOnly")}</span>
    </div>
  </footer>
</section>
