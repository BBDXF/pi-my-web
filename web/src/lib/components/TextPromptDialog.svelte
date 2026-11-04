<script lang="ts">
  import { t } from "$lib/i18n.svelte";
  let { title, value = "", onSubmit, onCancel }: {
    title: string;
    value?: string;
    onSubmit: (v: string) => void;
    onCancel: () => void;
  } = $props();
  let v = $state(value);
  let input: HTMLInputElement | undefined = $state();
  $effect(() => {
    input?.focus();
    input?.select();
  });
</script>

<div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={onCancel}>
  <form
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl"
    onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}
    onkeydown={(e) => e.key === "Escape" && onCancel()}
  >
    <h2 class="mb-3 text-base font-semibold">{title}</h2>
    <input bind:this={input} bind:value={v} class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
    <div class="mt-4 flex justify-end gap-2">
      <button type="button" class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted" onclick={onCancel}>{t("common.cancel")}</button>
      <button type="submit" disabled={!v.trim()} class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t("common.save")}</button>
    </div>
  </form>
</div>
