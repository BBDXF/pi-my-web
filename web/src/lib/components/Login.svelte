<script lang="ts">
  import { login } from "$lib/api";
  import { t } from "$lib/i18n.svelte";

  let { onSuccess }: { onSuccess: () => void } = $props();
  let password = $state("");
  let busy = $state(false);
  let error = $state("");

  async function submit(e: Event) {
    e.preventDefault();
    if (busy || !password) return;
    busy = true;
    error = "";
    try {
      await login(password);
      password = "";
      onSuccess();
    } catch (err) {
      const status = (err as { status?: number }).status;
      error = status === 401 || status === 403 ? t("login.failed") : err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
  <form
    class="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-7 shadow-xl"
    onsubmit={submit}
  >
    <div class="flex items-center gap-3">
      <img src="/favicon.svg" alt="" class="size-9 rounded-lg" />
      <div>
        <h1 class="text-base font-semibold tracking-tight">{t("login.title")}</h1>
        <p class="text-xs text-muted-foreground">{t("login.subtitle")}</p>
      </div>
    </div>
    <label class="block space-y-1.5">
      <span class="text-xs font-medium text-muted-foreground">{t("login.password")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="password"
        autocomplete="current-password"
        autofocus
        bind:value={password}
        class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </label>
    {#if error}
      <p class="text-xs text-destructive" role="alert">{error}</p>
    {/if}
    <button
      type="submit"
      disabled={busy || !password}
      class="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {t("login.submit")}
    </button>
  </form>
</div>
