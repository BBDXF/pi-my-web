<script lang="ts">
  import type { ForkCandidate, SessionRow, TreeNode } from "$lib/api";
  import {
    listSessions,
    openSession,
    closeSession,
    patchSession,
    compactSession,
    getMessages,
    getSession,
    getHealth,
    getTree,
    navigateTree,
    forkSession,
    setPendingEditorText,
    setModel,
    setThinking,
    abort,
    shareSession,
    getAuthStatus,
    archiveStored,
    unarchiveStored,
    deleteStored,
    downloadText,
    messageText,
    logout,
  } from "$lib/api";
  import { builtinByName } from "$lib/slash-builtins";
  import ChatPanel from "$lib/components/ChatPanel.svelte";
  import SessionList from "$lib/components/SessionList.svelte";
  import GitDiffSidebar from "$lib/components/GitDiffSidebar.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import ForkConfirmDialog from "$lib/components/ForkConfirmDialog.svelte";
  import TreeNavigateDialog from "$lib/components/TreeNavigateDialog.svelte";
  import SkillWorkspaceDialog from "$lib/components/SkillWorkspaceDialog.svelte";
  import Login from "$lib/components/Login.svelte";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import SessionManager from "$lib/components/SessionManager.svelte";
  import { t } from "$lib/i18n.svelte";
  import TextPromptDialog from "$lib/components/TextPromptDialog.svelte";
  import { loadAndApplyCustomization } from "$lib/customization";
  const SIDEBAR_KEY = "pi-gui-sidebar-open";
  const GIT_SIDEBAR_KEY = "pi-gui-git-sidebar-open";

  /** null = checking; login screen when required && !authenticated */
  let authOk = $state<boolean | null>(null);
  let authRequired = $state(false);
  let settingsOpen = $state(false);
  let managerOpen = $state(false);
  let booted = false;

  async function checkAuth() {
    const st = await getAuthStatus();
    authRequired = st.required;
    authOk = !st.required || st.authenticated;
    if (authOk && !booted) {
      booted = true;
      void bootData();
    }
  }
  async function doLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    sessions = [];
    selected = undefined;
    booted = false;
    authOk = false;
  }
  function openFromManager(row: SessionRow) {
    managerOpen = false;
    void onSelect(row);
  }

  let sessions = $state<SessionRow[]>([]);
  let selected = $state<SessionRow | undefined>(undefined);
  /** First successful (or failed) /api/sessions fetch — never re-block the sidebar. */
  let listReady = $state(false);
  let err = $state<string | null>(null);
  let sidebarOpen = $state(
    (() => {
      try {
        if (window.matchMedia("(max-width: 767px)").matches) return false;
        return localStorage.getItem(SIDEBAR_KEY) !== "0";
      } catch {
        return true;
      }
    })(),
  );
  let gitSidebarOpen = $state(
    (() => {
      try {
        return localStorage.getItem(GIT_SIDEBAR_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  function setSidebarOpen(open: boolean) {
    sidebarOpen = open;
    try {
      localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function setGitSidebarOpen(open: boolean) {
    gitSidebarOpen = open;
    try {
      localStorage.setItem(GIT_SIDEBAR_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  /** Non-fatal open note (e.g. model restore fallback) — dismissible */
  let warn = $state<string | null>(null);
  let shareNotice = $state<{ viewer: string; gist: string } | null>(null);
  let cmdkOpen = $state(false);
  let skillWorkspaceOpen = $state(false);
  let forkRequest = $state<{
    sourceId: string;
    candidate: ForkCandidate;
  } | null>(null);
  let forkBusy = $state(false);
  let forkError = $state("");
  let treeRequest = $state<{ sourceId: string; node: TreeNode } | null>(null);
  let treeBusy = $state(false);
  let treeError = $state("");
  let treeReturnId = $state<string | null>(null);
  let treeNavigation = $state<{
    token: number;
    sessionId: string;
    editorText?: string;
  } | null>(null);
  let treeNavigationToken = 0;
  /** One-shot palette target from composer `/` builtins. */
  let cmdkBoot = $state<string | null>(null);
  /** Server process.cwd() — fallback folder for new sessions */
  let defaultCwd = $state("");
  /** Prevent double-click open storms */
  let opening = false;

  $effect(() => {
    void loadAndApplyCustomization(selected?.cwd).catch(() => {});
  });
  /** Apply /sessions/:id once after first list load */
  let routedOnce = false;

  function sessionKey(s: SessionRow) {
    return s.path || s.id;
  }

  function pathSessionId(): string | null {
    const m = location.pathname.match(/^\/sessions\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setSessionUrl(id: string | undefined, mode: "push" | "replace" = "push") {
    const next = id ? `/sessions/${encodeURIComponent(id)}` : "/";
    if (location.pathname === next) return;
    if (mode === "replace") history.replaceState(null, "", next);
    else history.pushState(null, "", next);
  }

  /** Keep sidebar order stable across refresh (server sorts by modified). */
  function mergeSessions(prev: SessionRow[], next: SessionRow[]): SessionRow[] {
    if (prev.length === 0) return next;
    const byKey = new Map(next.map((s) => [sessionKey(s), s]));
    const used = new Set<string>();
    const out: SessionRow[] = [];
    for (const s of prev) {
      const k = sessionKey(s);
      const n = byKey.get(k);
      if (n) {
        out.push(n);
        used.add(k);
      }
    }
    for (const s of next) {
      const k = sessionKey(s);
      if (!used.has(k)) out.push(s);
    }
    return out;
  }

  function upsertSession(row: SessionRow) {
    const i = sessions.findIndex(
      (s) => s.id === row.id || (row.path && s.path === row.path),
    );
    if (i >= 0) {
      sessions = sessions.map((s, idx) =>
        idx === i ? { ...s, ...row, running: true } : s,
      );
    } else {
      // Append — don't jump the list to put new sessions on top
      sessions = [...sessions, { ...row, running: true }];
    }
  }

  function noteFallback(opened: { modelFallbackMessage?: string }) {
    if (opened.modelFallbackMessage) warn = opened.modelFallbackMessage;
  }

  async function refresh() {
    try {
      const { sessions: rows } = await listSessions();
      sessions = mergeSessions(sessions, rows);
      err = null;
      if (selected) {
        const row = rows.find(
          (r) =>
            r.id === selected?.id ||
            (selected?.path && r.path === selected.path),
        );
        if (row) {
          const nextId = row.running ? row.id : selected.id;
          selected = {
            ...selected,
            id: nextId,
            running: row.running,
            messageCount: row.messageCount,
            firstMessage: row.firstMessage,
            name: row.name ?? selected.name,
            sessionName: row.sessionName ?? selected.sessionName,
            modified: row.modified,
            path: row.path ?? selected.path,
          };
          if (pathSessionId() && pathSessionId() !== nextId) {
            setSessionUrl(nextId, "replace");
          }
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      listReady = true;
    }
  }

  async function onSelect(s: SessionRow, opts?: { replaceUrl?: boolean }) {
    // Already focused — zero network
    if (
      selected &&
      (selected.id === s.id || (s.path && selected.path === s.path))
    ) {
      setSessionUrl(selected.id, opts?.replaceUrl ? "replace" : "push");
      return;
    }

    err = null;
    const urlMode = opts?.replaceUrl ? "replace" : "push";

    // Already open in hub — just switch UI (no POST /api/sessions)
    if (s.running) {
      selected = s;
      upsertSession(s); // e.g. /fork returns a mounted session not yet in the list
      setSessionUrl(s.id, urlMode);
      return;
    }

    if (opening) return;
    opening = true;
    try {
      if (s.path) {
        const opened = await openSession({
          path: s.path,
          cwd: s.cwd || undefined,
        });
        noteFallback(opened);
        const row = { ...s, ...opened, running: true };
        selected = row;
        upsertSession(row);
        // Hub id may differ from disk list id — replace keeps one history entry
        setSessionUrl(
          row.id,
          pathSessionId() && pathSessionId() !== row.id ? "replace" : urlMode,
        );
      } else {
        const opened = await openSession({ fresh: true });
        noteFallback(opened);
        const row = { ...opened, running: true, firstMessage: "" };
        selected = row;
        upsertSession(row);
        setSessionUrl(row.id, urlMode);
      }
      // Re-list so sidebar Active/Recent and palette match hub (id may change on resume)
      await refresh();
      // List can miss the open hub session (path/id mismatch) — keep local truth
      if (selected) upsertSession({ ...selected, running: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Session not open/i.test(msg)) err = msg;
    } finally {
      opening = false;
    }
  }

  /** Home — no hub session until first prompt. Optional cwd seeds the folder picker. */
  let forceCwd = $state<string | null>(null);
  function onNew(cwd?: string) {
    err = null;
    forceCwd = cwd ?? null;
    selected = undefined;
    setSessionUrl(undefined);
  }

  async function ensureSession(opts?: {
    cwd?: string;
    model?: { provider?: string; id?: string };
  }): Promise<SessionRow> {
    const opened = await openSession({
      fresh: true,
      cwd: opts?.cwd || undefined,
    });
    noteFallback(opened);
    let row: SessionRow = { ...opened, running: true, firstMessage: "" };
    if (opts?.model?.provider && opts?.model?.id) {
      try {
        const updated = await setModel(row.id, {
          provider: opts.model.provider,
          id: opts.model.id,
        });
        row = { ...row, ...updated, running: true };
      } catch {
        /* keep default model from create */
      }
    }
    selected = row;
    upsertSession(row);
    setSessionUrl(row.id);
    return row;
  }

  function onSessionUpdate(id: string, patch: Partial<SessionRow>) {
    if (selected?.id === id) {
      selected = { ...selected, ...patch };
      if (patch.id && patch.id !== id) setSessionUrl(patch.id, "replace");
    }
    sessions = sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
  }

  async function onRename(name: string) {
    if (!selected?.id) return;
    try {
      await patchSession(selected.id, { name });
      onSessionUpdate(selected.id, { name });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  /** /import — browser file picker → upload JSONL → open session. */
  async function onImport(content: string, filename?: string) {
    err = null;
    if (opening) throw new Error("Already opening a session");
    opening = true;
    try {
      const opened = await openSession({ content, filename });
      noteFallback(opened);
      const row: SessionRow = { ...opened, running: true };
      selected = row;
      upsertSession(row);
      setSessionUrl(row.id);
      await refresh();
      if (selected) upsertSession({ ...selected, running: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      err = msg;
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      opening = false;
    }
  }

  // ── Sidebar context-menu actions ──
  let renameTarget = $state<SessionRow | null>(null);
  let deleteTarget = $state<SessionRow | null>(null);
  let deleteBusy = $state(false);

  function sameSession(a: SessionRow | undefined, b: SessionRow) {
    return Boolean(a && (a.id === b.id || (b.path && a.path === b.path)));
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      err = text;
    }
  }

  /** Dispose the live hub session (if any) so the file can be archived/deleted safely. */
  async function releaseLive(s: SessionRow) {
    if (s.running) {
      try {
        await closeSession(s.id);
      } catch {
        /* already gone */
      }
    }
    if (sameSession(selected, s)) {
      selected = undefined;
      setSessionUrl(undefined);
    }
    sessions = sessions.filter((x) => !sameSession(x, s) && x.id !== s.id);
  }

  async function onSessionAction(action: string, s: SessionRow) {
    err = null;
    try {
      switch (action) {
        case "open":
          await onSelect(s);
          break;
        case "rename":
          renameTarget = s;
          break;
        case "clone": {
          const { leafId } = await getTree(s.id);
          if (!leafId) {
            warn = t("app.cloneEmpty");
            break;
          }
          const row = await forkSession(s.id, leafId, { position: "at" });
          await onSelect({ ...row, running: true });
          break;
        }
        case "compact":
          await compactSession(s.id);
          break;
        case "export-html": {
          const { messages } = await getMessages(s.id);
          const base =
            (s.name || s.sessionName || s.id).replace(/[^\w.-]+/g, "_").slice(0, 60) || "session";
          const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
          const parts = messages.map(
            (m) => `<section><h3>${esc(m.role || "unknown")}</h3><pre>${esc(messageText(m))}</pre></section>`,
          );
          downloadText(
            `${base}.html`,
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(base)}</title><style>body{font-family:system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem}pre{white-space:pre-wrap;word-break:break-word;background:#faf9f7;padding:1rem;border-radius:8px}h3{text-transform:capitalize}</style></head><body><h1>${esc(base)}</h1>${parts.join("\n")}</body></html>`,
            "text/html",
          );
          break;
        }
        case "copy-path":
          if (s.path) await copyText(s.path);
          break;
        case "copy-id":
          await copyText(s.id);
          break;
        case "archive":
          if (s.path) {
            await releaseLive(s);
            await archiveStored(s.path);
          }
          break;
        case "unarchive":
          if (s.path) await unarchiveStored(s.path);
          break;
        case "delete":
          deleteTarget = s;
          return;
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    await refresh();
  }

  async function confirmRename(name: string) {
    const s = renameTarget;
    renameTarget = null;
    if (!s) return;
    try {
      await patchSession(s.id, { name });
      onSessionUpdate(s.id, { name });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    await refresh();
  }

  async function confirmDelete() {
    const s = deleteTarget;
    if (!s?.path || deleteBusy) return;
    deleteBusy = true;
    try {
      await releaseLive(s);
      await deleteStored(s.path);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      deleteBusy = false;
      deleteTarget = null;
    }
    await refresh();
  }

  async function onCompact() {
    if (!selected?.id) return;
    try {
      await compactSession(selected.id);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onCloseCurrent() {
    if (!selected?.id) return;
    try {
      await closeSession(selected.id);
      selected = undefined;
      setSessionUrl(undefined);
      await refresh();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function routeFromUrl() {
    const id = pathSessionId();
    if (!id) {
      selected = undefined;
      return;
    }
    if (selected?.id === id) return;
    let row = sessions.find((s) => s.id === id || s.path === id);
    if (!row) {
      // Disk id / cold URL: GET ensures open, returns canonical hub id
      try {
        const detail = await getSession(id);
        row = { ...detail, running: true };
        upsertSession(row);
        if (detail.id !== id) setSessionUrl(detail.id, "replace");
      } catch {
        setSessionUrl(undefined, "replace");
        err = t("app.notFound");
        return;
      }
    }
    await onSelect(row, { replaceUrl: true });
  }

  async function onCopyLast() {
    if (!selected?.id) return;
    try {
      const { messages } = await getMessages(selected.id);
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          const text = messages[i].content;
          const copyText =
            typeof text === "string"
              ? text
              : Array.isArray(text)
                ? text
                    .filter((p) => p && typeof p === "object" && p.type === "text")
                    .map((p) => p.text)
                    .join("")
                : "";
          if (copyText) {
            await navigator.clipboard.writeText(copyText);
          }
          break;
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onCycleModel(dir: "forward" | "backward") {
    if (!selected?.id) return;
    try {
      const row = await setModel(selected.id, { cycle: dir });
      onSessionUpdate(selected.id, {
        model: row.model,
        thinkingLevel: row.thinkingLevel ?? selected.thinkingLevel,
      });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onSetModel(provider: string, id: string) {
    if (!selected?.id) return;
    try {
      const row = await setModel(selected.id, { provider, id });
      onSessionUpdate(selected.id, {
        model: row.model ?? { provider, id },
        thinkingLevel: row.thinkingLevel ?? selected.thinkingLevel,
      });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onCycleThinking() {
    if (!selected?.id) return;
    try {
      const res = await setThinking(selected.id, { cycle: true });
      onSessionUpdate(selected.id, {
        thinkingLevel: res.level ?? res.thinkingLevel,
      });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onSetThinking(level: string) {
    if (!selected?.id) return;
    try {
      const res = await setThinking(selected.id, { level });
      onSessionUpdate(selected.id, {
        thinkingLevel: res.level ?? res.thinkingLevel ?? level,
      });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function onAbort() {
    if (!selected?.id) return;
    try {
      await abort(selected.id);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  function openPalette(boot?: string | null) {
    cmdkBoot = boot ?? null;
    cmdkOpen = true;
  }

  function requestFork(candidate: ForkCandidate) {
    if (!selected?.id || !candidate.entryId) return;
    forkError = "";
    forkRequest = { sourceId: selected.id, candidate };
  }

  async function confirmFork() {
    const request = forkRequest;
    if (!request || forkBusy) return;
    forkBusy = true;
    forkError = "";
    try {
      const row = await forkSession(request.sourceId, request.candidate.entryId, {
        position: "before",
      });
      setPendingEditorText(row.selectedText ?? request.candidate.text);
      forkRequest = null;
      await onSelect({ ...row, running: true });
    } catch (e) {
      forkError = e instanceof Error ? e.message : String(e);
    } finally {
      forkBusy = false;
    }
  }

  function requestTreeNavigation(node: TreeNode) {
    if (!selected?.id || !node.id) return;
    treeError = "";
    treeRequest = { sourceId: selected.id, node };
  }

  async function confirmTreeNavigation(opts: {
    summarize: boolean;
    customInstructions?: string;
  }) {
    const request = treeRequest;
    if (!request || treeBusy) return;
    treeBusy = true;
    treeError = "";
    try {
      const result = await navigateTree(request.sourceId, request.node.id, opts);
      if (result.aborted) {
        treeError = "Branch summarization was cancelled";
        return;
      }
      if (result.cancelled) {
        treeError = "Navigation was cancelled";
        return;
      }
      treeNavigation = {
        token: ++treeNavigationToken,
        sessionId: request.sourceId,
        editorText: result.editorText,
      };
      treeRequest = null;
      treeReturnId = null;
    } catch (e) {
      treeError = e instanceof Error ? e.message : String(e);
    } finally {
      treeBusy = false;
    }
  }

  function cancelTreeNavigation() {
    if (!treeRequest || treeBusy) return;
    treeReturnId = treeRequest.node.id;
    treeRequest = null;
    treeError = "";
    openPalette("tree");
  }

  /** pi `/clone` — branch at current leaf. */
  async function onClone() {
    if (!selected?.id) return;
    try {
      const { leafId } = await getTree(selected.id);
      if (!leafId) {
        warn = t("app.cloneEmpty");
        return;
      }
      const row = await forkSession(selected.id, leafId, { position: "at" });
      const next = { ...row, running: true };
      selected = next;
      upsertSession(next);
      setSessionUrl(next.id);
      await refresh();
      if (selected) upsertSession({ ...selected, running: true });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  function onBuiltinSlash(name: string) {
    const b = builtinByName(name);
    if (!b) return;
    const go = b.go;
    if (go === "na") {
      warn = t("app.notAvailable", { name });
      return;
    }
    if (go === "action:new") {
      onNew();
      return;
    }
    if (go === "action:compact") {
      void onCompact();
      return;
    }
    if (go === "action:copy") {
      void onCopyLast();
      return;
    }
    if (go === "action:clone") {
      void onClone();
      return;
    }
    if (go === "action:share") {
      void onShare();
      return;
    }
    if (go === "palette") {
      openPalette(null);
      return;
    }
    if (go.startsWith("palette:")) {
      openPalette(go.slice("palette:".length));
      return;
    }
  }

  async function onShare() {
    if (!selected?.id) {
      err = t("app.openToShare");
      return;
    }
    try {
      const res = await shareSession(selected.id);
      shareNotice = { viewer: res.url, gist: res.gistUrl };
      try {
        await navigator.clipboard.writeText(res.url);
      } catch {
        /* ignore */
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  async function bootData() {
    await refresh();
    if (!routedOnce) {
      routedOnce = true;
      await routeFromUrl();
    }
    try {
      const h = await getHealth();
      if (h.cwd) defaultCwd = h.cwd;
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cmdkOpen = !cmdkOpen;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  $effect(() => {
    const onPop = () => {
      void routeFromUrl();
    };
    window.addEventListener("popstate", onPop);
    const onUnauth = () => {
      booted = false;
      authOk = false;
    };
    window.addEventListener("pi-gui:unauthorized", onUnauth);
    void checkAuth();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pi-gui:unauthorized", onUnauth);
      window.removeEventListener("popstate", onPop);
    };
  });
</script>

{#if authOk === null}
  <div class="flex h-svh items-center justify-center bg-background text-sm text-muted-foreground">{t("common.loading")}</div>
{:else if authOk === false}
  <Login onSuccess={() => void checkAuth()} />
{:else}
<div class="flex h-svh w-full overflow-hidden bg-background text-foreground">
  {#if sidebarOpen}
    <SessionList
      {sessions}
      selectedId={selected?.id}
      {listReady}
      onSelect={onSelect}
      onNew={onNew}
      onCollapse={() => setSidebarOpen(false)}
      onOpenPalette={() => (cmdkOpen = true)}
      {onSessionAction}
    />
  {/if}
  {#if managerOpen}
    <SessionManager
      onOpen={openFromManager}
      onBack={() => (managerOpen = false)}
      onChanged={() => void refresh()}
    />
  {:else}
  <div class="flex min-w-0 flex-1 flex-col">
    {#if err}
      <div
        class="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
      >
        {err}
      </div>
    {/if}
    {#if warn}
      <div
        class="flex items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"
      >
        <span class="min-w-0 whitespace-pre-line">{warn}</span>
        <button
          type="button"
          class="shrink-0 text-xs underline opacity-80 hover:opacity-100"
          onclick={() => (warn = null)}
        >
          {t('common.dismiss')}
        </button>
      </div>
    {/if}
    {#if shareNotice}
      <div class="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div>{t('app.shareUrl')}: <a class="underline" href={shareNotice.viewer} target="_blank" rel="noreferrer">{shareNotice.viewer}</a></div>
            <div>Gist: <a class="underline" href={shareNotice.gist} target="_blank" rel="noreferrer">{shareNotice.gist}</a></div>
          </div>
          <button
            type="button"
            class="shrink-0 text-xs underline opacity-80 hover:opacity-100"
            onclick={() => (shareNotice = null)}
          >
            {t('common.dismiss')}
          </button>
        </div>
      </div>
    {/if}
    <ChatPanel
      session={selected}
      {defaultCwd}
      {forceCwd}
      {onSessionUpdate}
      onEnsureSession={ensureSession}
      onBuiltinSlash={onBuiltinSlash}
      onRequestFork={requestFork}
      {treeNavigation}
      showExpandSidebar={!sidebarOpen}
      showExpandGit={!gitSidebarOpen}
      onExpandSidebar={() => setSidebarOpen(true)}
      onExpandGit={() => setGitSidebarOpen(true)}
      onOpenPalette={() => (cmdkOpen = true)}
    />
  </div>
  {/if}
  {#if gitSidebarOpen}
    <GitDiffSidebar
      sessionId={selected?.running ? selected.id : undefined}
      cwd={selected?.cwd}
      onCollapse={() => setGitSidebarOpen(false)}
    />
  {/if}
</div>

<CommandPalette
  open={cmdkOpen}
  onClose={() => {
    cmdkOpen = false;
    cmdkBoot = null;
  }}
  session={selected}
  {sessions}
  boot={cmdkBoot}
  onBootConsumed={() => (cmdkBoot = null)}
  onNew={onNew}
  onResume={onSelect}
  onRename={onRename}
  {onImport}
  onCompact={onCompact}
  onCloseSession={onCloseCurrent}
  onCopyLast={onCopyLast}
  onShare={onShare}
  onOpenAppSettings={() => (settingsOpen = true)}
  onOpenManager={() => (managerOpen = true)}
  onLogout={authRequired ? doLogout : undefined}
  onOpenSkillsWorkspace={() => (skillWorkspaceOpen = true)}
  onRequestFork={requestFork}
  onRequestTree={requestTreeNavigation}
  initialTreeId={treeReturnId}
  onInitialTreeConsumed={() => (treeReturnId = null)}
  {onCycleModel}
  {onSetModel}
  {onCycleThinking}
  {onSetThinking}
  {onAbort}
/>

<SkillWorkspaceDialog
  open={skillWorkspaceOpen}
  sessionId={selected?.id}
  cwd={selected?.cwd}
  onClose={() => (skillWorkspaceOpen = false)}
/>

{#if forkRequest}
  <ForkConfirmDialog
    message={forkRequest.candidate.text}
    busy={forkBusy}
    error={forkError}
    onCancel={() => {
      if (!forkBusy) {
        forkRequest = null;
        forkError = "";
      }
    }}
    onConfirm={confirmFork}
  />
{/if}

{#if treeRequest}
  <TreeNavigateDialog
    node={treeRequest.node}
    busy={treeBusy}
    error={treeError}
    onCancel={cancelTreeNavigation}
    onNavigate={confirmTreeNavigation}
  />
{/if}
{/if}

{#if renameTarget}
  <TextPromptDialog
    title={t("ctx.renameTitle")}
    value={renameTarget.name || renameTarget.sessionName || ""}
    onSubmit={confirmRename}
    onCancel={() => (renameTarget = null)}
  />
{/if}

{#if deleteTarget}
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onclick={() => !deleteBusy && (deleteTarget = null)}>
    <div role="alertdialog" aria-modal="true" tabindex="-1" class="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === "Escape" && !deleteBusy && (deleteTarget = null)}>
      <h2 class="text-base font-semibold">{t("mgr.confirmTitle")}</h2>
      <p class="mt-1 truncate text-sm font-medium">{deleteTarget.name || deleteTarget.sessionName || deleteTarget.firstMessage?.trim() || deleteTarget.id.slice(0, 8)}</p>
      <p class="mt-2 text-sm text-muted-foreground">{t("mgr.confirmBody")}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted" disabled={deleteBusy} onclick={() => (deleteTarget = null)}>{t("common.cancel")}</button>
        <button type="button" data-confirm-delete class="h-9 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={deleteBusy} onclick={confirmDelete}>{t("common.delete")}</button>
      </div>
    </div>
  </div>
{/if}

<SettingsDialog open={settingsOpen} onClose={() => (settingsOpen = false)} />
