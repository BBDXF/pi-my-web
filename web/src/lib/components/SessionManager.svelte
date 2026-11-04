<script lang="ts">
  import type { StoredSession, SessionRow } from "$lib/api";
  import { archiveStored, deleteStored, listStoredSessions, unarchiveStored } from "$lib/api";
  import { t } from "$lib/i18n.svelte";
  import Archive from "@lucide/svelte/icons/archive";
  import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Search from "@lucide/svelte/icons/search";
  import Folder from "@lucide/svelte/icons/folder";

  let { onOpen, onBack, onChanged }: {
    onOpen: (s: SessionRow) => void;
    onBack: () => void;
    onChanged?: () => void;
  } = $props();

  let tab = $state<"active" | "archived">("active");
  let query = $state("");
  let items = $state<StoredSession[]>([]);
  let loading = $state(true);
  let error = $state("");
  let unavailable = $state(false);
  let confirming = $state<StoredSession | null>(null);
  let busyPath = $state("");

  async function load() {
    loading = true;
    error = "";
    unavailable = false;
    try {
      items = await listStoredSessions(tab === "archived");
    } catch (e) {
      items = [];
      const status = (e as { status?: number }).status;
      if (status === 404) unavailable = true;
      else error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void tab;
    void load();
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((s) => [s.name, s.firstMessage, s.cwd, s.id].some((x) => x?.toLowerCase().includes(q)))
      : items;
    const map = new Map<string, StoredSession[]>();
    for (const s of [...list].sort((a, b) => ts(b) - ts(a))) {
      const k = s.cwd || "";
      (map.get(k) ?? map.set(k, []).get(k)!).push(s);
    }
    return [...map.entries()].map(([cwd, rows]) => ({ cwd, rows }));
  });

  /** Last two path segments; full path stays in the tooltip. */
  function shortCwd(p: string) {
    return p.split("/").filter(Boolean).slice(-2).join("/") || p;
  }

  function ts(s: StoredSession) {
    const n = s.modified ? new Date(s.modified).getTime() : 0;
    return Number.isFinite(n) ? n : 0;
  }
  function title(s: StoredSession) {
    return s.name || s.firstMessage?.trim().replace(/\s+/g, " ") || s.id.slice(0, 8);
  }
  function when(s: StoredSession) {
    const n = ts(s);
    return n ? new Date(n).toLocaleString() : "";
  }

  async function act(s: StoredSession, fn: (p: string) => Promise<unknown>) {
    busyPath = s.path;
    error = "";
    try {
      await fn(s.path);
      items = items.filter((x) => x.path !== s.path);
      onChanged?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busyPath = "";
      confirming = null;
    }
  }

  function open(s: StoredSession) {
    onOpen({ id: s.id, path: s.path, cwd: s.cwd, name: s.name, firstMessage: s.firstMessage, modified: s.modified, messageCount: s.messageCount, running: false });
  }
</script>

<div class="flex min-w-0 flex-1 flex-col bg-[var(--pi-canvas)]">
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
    <button type="button" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("mgr.back")} title={t("mgr.back")} onclick={onBack}>
      <ArrowLeft class="size-4" />
    </button>
    <h1 class="text-sm font-semibold">{t("mgr.title")}</h1>
  </header>

  <div class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {#each ["active", "archived"] as const as k (k)}
          <button type="button" class="rounded-md px-3 py-1 transition-colors {tab === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}" onclick={() => (tab = k)}>
            {t(k === "active" ? "mgr.active" : "mgr.archived")}
          </button>
        {/each}
      </div>
      <label class="relative min-w-48 flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input type="search" bind:value={query} placeholder={t("mgr.search")} class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
      </label>
    </div>

    {#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>{/if}

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if loading}
        <p class="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      {:else if unavailable}
        <p class="py-10 text-center text-sm text-muted-foreground">{t("mgr.unavailable")}</p>
      {:else if filtered.length === 0}
        <p class="py-10 text-center text-sm text-muted-foreground">{t("mgr.empty")}</p>
      {:else}
        {#each filtered as g (g.cwd)}
          <section class="mb-4">
            <h2 class="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground" title={g.cwd}>
              <Folder class="size-3.5" />
              <span class="truncate">{g.cwd ? shortCwd(g.cwd) : t("common.other")}</span>
              <span class="ml-auto tabular-nums">{g.rows.length}</span>
            </h2>
            <ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {#each g.rows as s (s.path)}
                <li class="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 {busyPath === s.path ? 'opacity-50' : ''}">
                  <button type="button" class="min-w-0 flex-1 text-left" title={t("mgr.open")} onclick={() => open(s)}>
                    <div class="truncate text-sm font-medium">{title(s)}</div>
                    <div class="truncate text-[11px] text-muted-foreground">
                      {when(s)}{#if s.messageCount != null} · {t("mgr.messages", { n: s.messageCount })}{/if}
                    </div>
                  </button>
                  {#if tab === "active"}
                    <button type="button" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title={t("mgr.archive")} aria-label={t("mgr.archive")} onclick={() => act(s, archiveStored)}><Archive class="size-4" /></button>
                  {:else}
                    <button type="button" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title={t("mgr.unarchive")} aria-label={t("mgr.unarchive")} onclick={() => act(s, unarchiveStored)}><ArchiveRestore class="size-4" /></button>
                  {/if}
                  <button type="button" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive" title={t("mgr.delete")} aria-label={t("mgr.delete")} onclick={() => (confirming = s)}><Trash2 class="size-4" /></button>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </div>
  </div>
</div>

{#if confirming}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={() => (confirming = null)}>
    <div role="alertdialog" aria-modal="true" tabindex="-1" class="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === "Escape" && (confirming = null)}>
      <h2 class="text-base font-semibold">{t("mgr.confirmTitle")}</h2>
      <p class="mt-1 truncate text-sm font-medium">{title(confirming)}</p>
      <p class="mt-2 text-sm text-muted-foreground">{t("mgr.confirmBody")}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted" onclick={() => (confirming = null)}>{t("common.cancel")}</button>
        <button type="button" class="h-9 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700" onclick={() => confirming && act(confirming, deleteStored)}>{t("common.delete")}</button>
      </div>
    </div>
  </div>
{/if}
