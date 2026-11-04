<script lang="ts" module>
  import type { Component } from "svelte";
  export type MenuItem = {
    id: string;
    label: string;
    icon?: Component<{ class?: string }>;
    danger?: boolean;
    disabled?: boolean;
    /** Draw a divider above this item. */
    separator?: boolean;
  };
</script>

<script lang="ts">
  import { tick } from "svelte";

  type Props = {
    items: MenuItem[];
    x: number;
    y: number;
    label?: string;
    onSelect: (id: string) => void;
    onClose: () => void;
  };
  let { items, x, y, label = "", onSelect, onClose }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ left: 0, top: 0 });
  let active = $state(-1);

  const enabled = $derived(items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0));

  function focusItem(i: number) {
    active = i;
    el?.querySelectorAll<HTMLButtonElement>("[role=menuitem]")[i]?.focus();
  }

  function move(dir: 1 | -1) {
    if (!enabled.length) return;
    const cur = enabled.indexOf(active);
    const next = cur < 0 ? (dir === 1 ? 0 : enabled.length - 1) : (cur + dir + enabled.length) % enabled.length;
    focusItem(enabled[next]);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      if (enabled.length) focusItem(enabled[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      if (enabled.length) focusItem(enabled[enabled.length - 1]);
    } else if (e.key === "Tab") {
      onClose();
    }
  }

  // Place inside viewport, then focus first enabled item.
  $effect(() => {
    void items;
    const px = x;
    const py = y;
    void tick().then(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const m = 8;
      pos = {
        left: Math.max(m, Math.min(px, window.innerWidth - r.width - m)),
        top: Math.max(m, Math.min(py, window.innerHeight - r.height - m)),
      };
      if (active < 0 && enabled.length) focusItem(enabled[0]);
    });
  });

  $effect(() => {
    const down = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    const scroll = (e: Event) => {
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("wheel", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  });
</script>

<div
  bind:this={el}
  role="menu"
  tabindex="-1"
  aria-label={label}
  data-session-menu
  class="fixed z-[70] min-w-48 max-w-72 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl outline-none"
  style="left:{pos.left}px;top:{pos.top}px"
  oncontextmenu={(e) => e.preventDefault()}
  onkeydown={onKeydown}
>
  {#each items as it, i (it.id)}
    {#if it.separator}<div class="my-1 h-px bg-border" role="separator"></div>{/if}
    <button
      type="button"
      role="menuitem"
      disabled={it.disabled}
      tabindex={active === i ? 0 : -1}
      data-action={it.id}
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors focus:bg-muted hover:bg-muted disabled:pointer-events-none disabled:opacity-40
        {it.danger ? 'text-destructive focus:bg-destructive/10 hover:bg-destructive/10' : ''}"
      onmouseenter={() => !it.disabled && focusItem(i)}
      onclick={() => {
        if (it.disabled) return;
        onSelect(it.id);
      }}
    >
      {#if it.icon}<it.icon class="size-3.5 shrink-0 opacity-70" />{/if}
      <span class="min-w-0 flex-1 truncate">{it.label}</span>
    </button>
  {/each}
</div>
