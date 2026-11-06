# Changelog

## 0.6.2

- Fix: the chat closed its live event stream (SSE) shortly after opening a session, whenever the session row was patched with the same id. Live updates were then lost; for example `/compact` showed no "compacting" state and the chat did not refresh after compaction.

## 0.6.1

- Bash cards: the header shows the first line of the command; expanding the card shows the full multi-line (or long) command with bash highlighting, above the output.

## 0.6.0

- Subagent support for [@tintinweb/pi-subagents](https://www.npmjs.com/package/@tintinweb/pi-subagents): subagent sessions are nested under their parent in the sidebar, open in a read-only live view, and show token usage and tools.
- Archive, restore and delete a parent together with its subagents; clean-up action for subagents (refused while one is running).
- Tools chip and popover per chat: active tools, MCP, extensions and skills (`GET /api/sessions/:id/capabilities`).
- Web sessions load pi's built-in extensions (codemode, MCP, tool_search).
- Sidebar token total includes subagents; subagent group toggle fix.

## 0.5.0

First release of the `pi-my-web` fork of pi-gui-extension.

- Multi-session chat UI with live attach via `/gui` inside pi.
- Standalone daemon (`pi-my-web` command) with password login (`PI_MY_WEB_PASSWORD`), systemd unit in `contrib/`.
- Session manager and context menu: archive/restore/delete, compact, fork, rename, export HTML, copy path/ID.
- Themes (including VS Code themes) and i18n (English / 中文); better CJK/Latin font stacks.
- Usage details view.
- Git panel fixes: large diffs no longer freeze the tab, 5s git timeout, clearer path/non-repo messages.
- Tests now isolate `PI_CODING_AGENT_DIR` in a temp dir and run with a timeout.
- Renamed package to `pi-my-web`; published as an npm package with prebuilt UI in `dist/`.
