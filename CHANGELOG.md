# Changelog

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
