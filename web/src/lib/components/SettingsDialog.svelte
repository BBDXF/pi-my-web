<script lang="ts">
  import { LOCALES, i18n, setLocale, t } from "$lib/i18n.svelte";
  import { THEMES, appTheme, setAppTheme } from "$lib/themes.svelte";
  import X from "@lucide/svelte/icons/x";
  import Check from "@lucide/svelte/icons/check";

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();
</script>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && onClose()} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
      tabindex="-1"
      class="max-h-[85svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold">{t("settings.title")}</h2>
        <button type="button" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={t("common.close")} onclick={onClose}>
          <X class="size-4" />
        </button>
      </div>

      <section class="mb-5">
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.language")}</h3>
        <div class="flex gap-2">
          {#each LOCALES as l (l.id)}
            <button
              type="button"
              class="rounded-md border px-3 py-1.5 text-sm transition-colors {i18n.locale === l.id ? 'border-primary bg-muted font-medium' : 'border-border hover:bg-muted/70'}"
              aria-pressed={i18n.locale === l.id}
              onclick={() => setLocale(l.id)}
            >{l.label}</button>
          {/each}
        </div>
      </section>

      <section>
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.theme")}</h3>
        <p class="mb-3 text-xs text-muted-foreground">{t("settings.themeHint")}</p>
        {#each [{ dark: false, key: "settings.themeLight" }, { dark: true, key: "settings.themeDark" }] as grp (grp.key)}
          <h4 class="mb-1.5 mt-3 text-[11px] font-medium text-muted-foreground">{t(grp.key as "settings.themeLight")}</h4>
          <div class="grid grid-cols-2 gap-2.5">
            {#each THEMES.filter((x) => x.dark === grp.dark) as th (th.id)}
              <button
                type="button"
                data-theme-card={th.id}
                class="group relative overflow-hidden rounded-lg border text-left transition-all hover:-translate-y-px {appTheme.id === th.id ? 'border-primary ring-1 ring-primary' : 'border-border'}"
                aria-pressed={appTheme.id === th.id}
                onclick={() => setAppTheme(th.id)}
              >
                <div class="flex h-16 gap-1 p-2" style="background:{th.bg}">
                  <div class="flex w-1/4 flex-col gap-1 rounded p-1" style="background:{th.surface};border:1px solid {th.border}">
                    <div class="h-1 rounded-full" style="background:{th.muted}"></div>
                    <div class="h-1 w-2/3 rounded-full" style="background:{th.mutedFg}"></div>
                  </div>
                  <div class="flex flex-1 flex-col justify-center gap-1.5">
                    <div class="h-1.5 w-3/4 rounded-full" style="background:{th.fg}"></div>
                    <div class="h-1.5 w-1/2 rounded-full" style="background:{th.mutedFg}"></div>
                    <div class="flex gap-1">
                      <div class="h-1.5 w-5 rounded-full" style="background:{th.primary}"></div>
                      <div class="h-1.5 w-3 rounded-full" style="background:{th.accent}"></div>
                      <div class="h-1.5 w-3 rounded-full" style="background:{th.add}"></div>
                      <div class="h-1.5 w-3 rounded-full" style="background:{th.del}"></div>
                    </div>
                  </div>
                </div>
                <div class="flex items-center justify-between bg-card px-2.5 py-1.5 text-xs font-medium">
                  {i18n.locale === "zh-CN" ? th.labelZh : th.label}
                  {#if appTheme.id === th.id}<Check class="size-3.5" />{/if}
                </div>
              </button>
            {/each}
          </div>
        {/each}
      </section>
    </div>
  </div>
{/if}
