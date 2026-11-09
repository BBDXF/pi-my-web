<script lang="ts">
  import { t } from "$lib/i18n.svelte";
  import type { ExtensionUiRequest } from "$lib/chat-stream";
  let { request, onAnswer, onCancel }: {
    request: ExtensionUiRequest;
    onAnswer: (v: string | boolean) => void;
    onCancel: () => void;
  } = $props();
  let text = $state(request.method === "editor" ? (request.prefill ?? "") : "");
  let active = $state(0);
  let root: HTMLElement | undefined = $state();
  $effect(() => {
    const el = root?.querySelector<HTMLElement>("input, textarea, [data-autofocus]");
    (el ?? root)?.focus();
  });
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (request.method === "select") {
      const n = request.options?.length ?? 0;
      if (e.key === "ArrowDown") { e.preventDefault(); active = n ? (active + 1) % n : 0; }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = n ? (active - 1 + n) % n : 0; }
      else if (e.key === "Enter" && n) { e.preventDefault(); onAnswer(request.options![active]); }
    } else if (request.method === "confirm" && e.key === "Enter") {
      e.preventDefault();
      onAnswer(true);
    }
  }
  $effect(() => {
    if (request.method === "select") {
      root?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }
  });
</script>

<div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={onCancel}>
  <form
    bind:this={root}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label={request.title}
    class="flex max-h-[85vh] w-full {request.method === 'editor' ? 'max-w-2xl' : 'max-w-md'} flex-col rounded-2xl border border-border bg-popover p-5 shadow-2xl outline-none"
    onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => {
      e.preventDefault();
      if (request.method === "input" || request.method === "editor") onAnswer(text);
    }}
    onkeydown={onKey}
  >
    <h2 class="mb-3 text-base font-semibold whitespace-pre-wrap">{request.title}</h2>
    {#if request.method === "select"}
      <div class="min-h-0 flex-1 overflow-y-auto" role="listbox">
        {#each request.options ?? [] as opt, i}
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            data-idx={i}
            class="block w-full rounded-md px-3 py-2 text-left text-sm {i === active ? 'bg-muted' : 'hover:bg-muted/60'}"
            onmouseenter={() => (active = i)}
            onclick={() => onAnswer(opt)}
          >{opt}</button>
        {/each}
      </div>
    {:else if request.method === "confirm"}
      <p class="text-sm whitespace-pre-wrap text-muted-foreground">{request.message}</p>
    {:else if request.method === "input"}
      <input bind:value={text} placeholder={request.placeholder ?? ""} class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
    {:else}
      <textarea bind:value={text} rows="12" class="w-full rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"></textarea>
    {/if}
    <div class="mt-4 flex justify-end gap-2">
      {#if request.method === "confirm"}
        <button type="button" class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted" onclick={() => onAnswer(false)}>{t("extui.no")}</button>
        <button type="button" data-autofocus class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onclick={() => onAnswer(true)}>{t("extui.yes")}</button>
      {:else}
        <button type="button" class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted" onclick={onCancel}>{t("common.cancel")}</button>
        {#if request.method === "input" || request.method === "editor"}
          <button type="submit" class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">{t("extui.ok")}</button>
        {/if}
      {/if}
    </div>
  </form>
</div>
