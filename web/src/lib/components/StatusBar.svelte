<script lang="ts">
  /** Session header — title / cwd / status. Near-limit shows Compact. */
  import type { SessionRow } from "$lib/api";
  import { compactSession, renameSession } from "$lib/api";
  import Badge from "agentic-ui-kit/components/ui/badge.svelte";
  import Button from "agentic-ui-kit/components/ui/button.svelte";
  import Input from "agentic-ui-kit/components/ui/input.svelte";
  import Tooltip from "agentic-ui-kit/components/ui/tooltip.svelte";
  import TooltipContent from "agentic-ui-kit/components/ui/tooltip-content.svelte";
  import TooltipTrigger from "agentic-ui-kit/components/ui/tooltip-trigger.svelte";
  import CircleDollarSign from "@lucide/svelte/icons/circle-dollar-sign";
  import Gauge from "@lucide/svelte/icons/gauge";
  import { t } from "$lib/i18n.svelte";
  import CommandIcon from "@lucide/svelte/icons/command";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import PanelRight from "@lucide/svelte/icons/panel-right";

  type Props = {
    session: SessionRow;
    onError?: (msg: string) => void;
    onUpdate?: (patch: Partial<SessionRow>) => void;
    showExpandSidebar?: boolean;
    showExpandGit?: boolean;
    onExpandSidebar?: () => void;
    onExpandGit?: () => void;
    onOpenPalette?: () => void;
  };

  let {
    session,
    onError,
    onUpdate,
    showExpandSidebar = false,
    showExpandGit = false,
    onExpandSidebar,
    onExpandGit,
    onOpenPalette,
  }: Props = $props();

  let renaming = $state(false);
  let nameDraft = $state("");
  /** Local name override after rename (until parent catches up). */
  let nameOverride = $state<string | null>(null);
  let compactingLocal = $state(false);

  const title = $derived(
    nameOverride ||
      session.sessionName ||
      session.name ||
      session.firstMessage?.slice(0, 60) ||
      session.id.slice(0, 8),
  );

  const isCompacting = $derived(
    Boolean(session.isCompacting || session.compacting || compactingLocal),
  );

  const u = $derived.by(() => {
    const cu = session.contextUsage ?? session.stats?.contextUsage;
    const tk = session.stats?.tokens;
    const rawCost = session.stats?.cost;
    const statCost =
      typeof rawCost === "number" ? rawCost : typeof rawCost === "object" ? rawCost?.total : undefined;
    const num = (...v: (number | null | undefined)[]) =>
      v.find((x) => typeof x === "number" && !Number.isNaN(x)) ?? null;
    const used = num(session.usage?.contextTokens, session.contextTokens, cu?.tokens);
    const win = num(session.usage?.contextWindow, session.contextWindow, cu?.contextWindow);
    let pct = num(session.usage?.percent, session.percent, cu?.percent);
    if (pct == null && used != null && win) pct = (used / win) * 100;
    const m = session.usage?.model ?? session.model;
    return {
      used,
      win,
      pct,
      input: num(session.usage?.input, session.input, tk?.input, session.stats?.inputTokens),
      output: num(session.usage?.output, session.output, tk?.output, session.stats?.outputTokens),
      cacheRead: num(session.usage?.cacheRead, session.cacheRead, tk?.cacheRead),
      cacheWrite: num(session.usage?.cacheWrite, session.cacheWrite, tk?.cacheWrite),
      total: num(session.usage?.totalTokens, session.totalTokens, tk?.total),
      cost: num(session.usage?.cost, session.cost, statCost),
      model: m ? (m.name ?? m.id ?? "") : "",
    };
  });
  const ctxPct = $derived(u.pct);
  /** Surface compact CTA when context is getting tight. */
  const nearLimit = $derived(ctxPct != null && ctxPct >= 80);
  let popOpen = $state(false);
  const hasUsage = $derived(u.pct != null || u.cost != null || u.total != null);

  function fmtTok(n: number | null) {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(Math.round(n));
  }
  function fmtCost(c: number | null) {
    if (c == null) return "—";
    return c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(3)}`;
  }
  const headline = $derived(
    [
      u.used != null || u.win != null ? `${fmtTok(u.used)} / ${fmtTok(u.win)}` : null,
      u.pct != null ? `${Math.round(u.pct)}%` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const rows = $derived([
    ["usage.input", fmtTok(u.input)],
    ["usage.output", fmtTok(u.output)],
    ["usage.cacheRead", fmtTok(u.cacheRead)],
    ["usage.cacheWrite", fmtTok(u.cacheWrite)],
    ["usage.total", fmtTok(u.total)],
    ["usage.cost", fmtCost(u.cost)],
  ] as const);

  async function doCompact() {
    if (!session.id || isCompacting) return;
    compactingLocal = true;
    onUpdate?.({ isCompacting: true });
    try {
      await compactSession(session.id);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
      onUpdate?.({ isCompacting: false });
    } finally {
      compactingLocal = false;
    }
  }

  // Clear rename override when switching sessions (id change only — no detail loop)
  let lastId = $state<string | null>(null);
  $effect(() => {
    const id = session.id;
    if (id === lastId) return;
    lastId = id;
    nameOverride = null;
    renaming = false;
  });

  function startRename() {
    nameDraft =
      nameOverride || session.sessionName || session.name || "";
    renaming = true;
  }

  async function commitRename() {
    if (!renaming) return;
    const name = nameDraft.trim();
    renaming = false;
    const prev = nameOverride || session.sessionName || session.name || "";
    if (!name || name === prev) return;
    try {
      await renameSession(session.id, name);
      nameOverride = name;
      onUpdate?.({ name, sessionName: name });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  function onRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      renaming = false;
    }
  }
</script>

<header
  class="flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-[var(--pi-canvas)] px-2 dark:border-white/10 sm:gap-3 sm:px-3"
>
  {#if showExpandSidebar && onExpandSidebar}
    <Button
      variant="ghost"
      size="icon"
      class="size-8 shrink-0 text-muted-foreground"
      title={t("sidebar.expand")}
      aria-label={t("sidebar.expand")}
      onclick={onExpandSidebar}
    >
      <PanelLeft class="size-4" />
    </Button>
  {/if}

{#if showExpandSidebar && onOpenPalette}
    <button
      type="button"
      class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={t("sidebar.commandPalette")}
      aria-label={t("sidebar.commandPalette")}
      onclick={onOpenPalette}
    >
      <CommandIcon class="size-4" />
    </button>
  {/if}

  <div class="min-w-0 flex-1">
    {#if renaming}
      <Input
        class="h-7 max-w-sm text-sm font-semibold"
        bind:value={nameDraft}
        onkeydown={onRenameKey}
        onblur={commitRename}
      />
    {:else}
      <button
        type="button"
        class="flex min-w-0 max-w-full items-baseline gap-2 text-left"
        title={t("status.rename")}
        ondblclick={startRename}
      >
        <span class="truncate text-sm font-semibold">{title}</span>
        {#if session.cwd}
          <span class="hidden truncate text-[11px] text-muted-foreground sm:inline">
            {session.cwd.split("/").filter(Boolean).slice(-2).join("/") || session.cwd}
          </span>
        {/if}
      </button>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-2">
    {#if hasUsage}
      <div
        class="relative"
        role="group"
        aria-label={t("status.usage")}
        onmouseenter={() => (popOpen = true)}
        onmouseleave={() => (popOpen = false)}
      >
        <button
          type="button"
          class="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted {nearLimit
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'border-border/70'}"
          aria-expanded={popOpen}
          onclick={() => (popOpen = !popOpen)}
        >
          <Gauge class="size-3" />
          <span>{headline || fmtCost(u.cost)}</span>
          {#if u.cost != null && headline}
            <span class="hidden opacity-70 sm:inline">· {fmtCost(u.cost)}</span>
          {/if}
        </button>
        {#if popOpen}
          <div class="absolute right-0 top-full z-40 pt-1.5">
            <div class="w-60 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
              <div class="mb-1 flex items-baseline justify-between">
                <span class="font-medium">{t("usage.context")}</span>
                <span class="font-mono tabular-nums">{headline || "—"}</span>
              </div>
              <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full {nearLimit ? 'bg-amber-500' : 'bg-primary'}"
                  style="width:{Math.min(100, Math.max(0, u.pct ?? 0))}%"
                ></div>
              </div>
              <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                {#each rows as [k, v] (k)}
                  <dt class="text-muted-foreground">{t(k)}</dt>
                  <dd class="text-right font-mono tabular-nums">{v}</dd>
                {/each}
                {#if u.model}
                  <dt class="text-muted-foreground">{t("usage.model")}</dt>
                  <dd class="max-w-32 truncate text-right font-mono" title={u.model}>{u.model}</dd>
                {/if}
              </dl>
            </div>
          </div>
        {/if}
      </div>
    {/if}
    {#if nearLimit && !isCompacting}
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-6 px-2 text-[10px] {ctxPct != null && ctxPct >= 95
          ? 'border-amber-500/60 text-amber-700 dark:text-amber-400'
          : ''}"
        title={t("status.compact")}
        onclick={doCompact}
      >
        {t('status.compact')}
      </Button>
    {/if}
    {#if isCompacting}
      <Badge variant="secondary" class="h-6 text-[10px]">{t('status.compacting')}</Badge>
    {/if}
    {#if showExpandGit && onExpandGit}
      <Button
        variant="ghost"
        size="icon"
        class="size-8 shrink-0 text-muted-foreground"
        title={t("status.showChanges")}
        aria-label={t("status.showChanges")}
        onclick={onExpandGit}
      >
        <PanelRight class="size-4" />
      </Button>
    {/if}
  </div>
</header>
