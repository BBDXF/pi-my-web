# pi-gui-extension

Pi extension for a localhost multi-session web UI over the same coding-agent SDK as the terminal.


<img width="2940" height="1846" alt="pi-gui" src="https://github.com/user-attachments/assets/e1da0c5c-fe19-445e-9f07-24625eeef5f9" />


## Fork changes (BBDXF)

This fork of [ankitchouhan1020/pi-gui-extension](https://github.com/ankitchouhan1020/pi-gui-extension) adds:

- **Standalone daemon**: `bin/pi-gui` runs the server without a TUI pi (`PI_GUI_PORT`, `PI_GUI_HOST`); `contrib/pi-gui.service` is a systemd user unit for start at boot.
- **Password auth**: set `PI_GUI_PASSWORD` to require a login (HttpOnly cookie). Unset = no auth, as upstream.
- **i18n**: English / 简体中文, switchable in the command menu ("Appearance & language").
- **Themes**: Dark, Light, Tokyo Night, Catppuccin Mocha/Latte, Gruvbox, Nord, One Dark.
- **Detailed context/token usage**: used / window tokens, input, output, cache read/write, total, cost and model instead of a bare percentage.
- **Session manager**: browse stored sessions, open, archive/unarchive (`~/.pi/agent/sessions-archive`), delete.
- **Git panel fixes**: no more tab freeze on large diffs (highlight/size caps), 5 s git timeout, collapsed untracked dirs, correct paths in repo subfolders, clear notices for unsupported folders.
- Removed the Quit command; settings, session manager and logout live in the command menu.

## Install

```bash
pi install npm:pi-gui-extension
```

Requires Node.js ≥ 20 and a working pi install (models / auth already set up).

Git and path installs work from the repository because package-root `dist/` is
committed. After changing `web/`, run `npm install --prefix web && npm run build`
before testing the local package with `pi install <path>`.

```bash
pi remove npm:pi-gui-extension
```

## Usage

In any pi session:

```text
/gui                          # live-attach current session + open browser
/gui <sessionId>              # open that session (live if in-process, else from disk)
/gui open <sessionId>         # same
/gui open <sessionId> 4000    # custom port
/gui stop                     # shut down
```

`/gui` ensures the host runs in this process (takes over the port if needed), then opens the browser on the session. Pass a **session id** (or path) to target a specific chat; omit it to use the current TUI session.

How this relates to pi (disk vs live, ownership): [ownership documentation](./docs/src/content/docs/concepts/ownership.md).

Localhost only (`127.0.0.1`). No auth — treat it like the TUI on your machine.

## Features

- **Multi-session** — open, resume, and switch chats; concurrent turns
- **Streaming** — assistant text, tools, and thinking over SSE
- **Steer & abort** — send while the agent works; stop a turn
- **Models & thinking** — picker and levels from the status bar / palette
- **Command palette** (⌘K) — `/new`, `/resume`, `/session`, models, skills, export, …
- **Skill workspace** — browse loaded skills, view or edit Markdown, and create/import project or user skills directly into pi
- **Git Changes** — working-tree status and diffs for the session cwd
- **Images & bash** — paste/drop images; `!command` in the composer
- **Theme** — light / dark

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `PI_GUI_PORT` | `3847` | HTTP port |
| `PI_GUI_SESSION_IDLE_MS` | `86400000` (1 day) | Close hub session when no SSE clients (`0` disables) |

Models, auth, skills, and extensions come from pi — this package does not add a second config system.

## License

[MIT](./LICENSE)

## Documentation

For humans: [pi-gui.pages.dev](https://pi-gui.pages.dev/) is a TanStack Start landing page with install, usage, and customization examples.

For coding agents: read [`llms.txt`](./llms.txt) before changing code. It contains the repo map, safe change boundaries, customization contract, anti-patterns, and test commands.

```bash
npm install --prefix docs
npm run dev:docs       # local docs server
npm run build:docs     # TanStack Start build in docs/dist/
```

## Standalone daemon (systemd)

```bash
npm i -g pi-gui-extension            # provides `pi-gui`
mkdir -p ~/.config/pi-gui ~/.config/systemd/user
printf 'PI_GUI_PORT=3847\nPI_GUI_HOST=127.0.0.1\nPI_GUI_PASSWORD=change-me\n' > ~/.config/pi-gui/env
chmod 600 ~/.config/pi-gui/env
cp contrib/pi-gui.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pi-gui
loginctl enable-linger "$USER"       # keep running after logout
```

Env: `PI_GUI_PORT` (3847), `PI_GUI_HOST` (127.0.0.1), `PI_GUI_PASSWORD` (enables login; all `/api/*` return 401 until `POST /api/auth/login`). Set a password before binding a non-loopback host. The in-pi `/gui` command still works (loopback, no password).
