<script lang="ts">
  import { onMount } from "svelte";
  import { getSubagentTranscript, isPairedToolResult, messageKey } from "$lib/api";
  import type { ChatMessage, SessionRow } from "$lib/api";
  import MessageBubble from "$lib/components/MessageBubble.svelte";
  import { t, i18n } from "$lib/i18n.svelte";
  import { relativeTime } from "$lib/utils";
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
