---
id: R-02
type: research
state: current
created: 2026-09-25
---

# Host research: Orca: terminal session persistence across restarts

Source: [stablyai/orca](https://github.com/stablyai/orca), an Electron terminal and agent
workspace. Examined at HEAD on 2026-09-22. File paths below are relative to the Orca repo root,
not this one.

## Summary

Orca runs every terminal in a separate, detached background process: the terminal daemon.
Quitting the Electron app disconnects from the daemon; it does not stop it. The daemon and its
PTYs keep running. On relaunch, the app finds the daemon's socket and reattaches to the same
sessions. A full reboot kills the daemon. After that, Orca restores sessions from disk, which the
project calls a cold restore.

## What survives what

| Situation | What survives | Mechanism |
| --- | --- | --- |
| App restart or update | The running PTY process and its state | Reattach to the same daemon over its socket |
| Daemon crash or system reboot | Screen content, and for agents the conversation | Disk checkpoint plus an agent resume command |

## 1. Launching the daemon

`src/main/daemon/daemon-launched-child-spawn.ts` forks `daemon-entry.js` using the Electron
binary with `ELECTRON_RUN_AS_NODE=1`, so it runs as plain Node. This avoids GUI initialization
that would interfere with `node-pty`. The child is spawned with `detached: true` and unref'd, and
its stdio is `['ignore', 'ignore', 'pipe', 'ipc']`: stderr is piped so startup crashes can be
captured, and the IPC channel carries a readiness handshake. Its working directory is the app's
userData directory, so it survives a deleted worktree.

On Linux, the daemon can run inside `systemd-run --user --scope`, so stopping a service does not
kill it. Orca's own `docs/reference/orcad-operations.md` notes that `KillMode=mixed` or
`control-group` would kill it otherwise. On Windows, the daemon executable is copied into
userData so the NSIS updater does not overwrite the running binary.

The daemon owns every PTY through `node-pty`. The Electron app itself never holds a PTY handle.

## 2. Endpoint and protocol

The daemon listens on a Unix socket at `<userData>/daemon/daemon-v<PROTOCOL_VERSION>.sock` (a
named pipe, `\\?\pipe\orca-terminal-host-v<N>-...`, on Windows), alongside a token file and a PID
file. Messages are NDJSON over the socket.

Each client opens two connections: `control` for RPCs and `stream` for output. The first message
on each is a `hello` carrying the auth token; the daemon replies with its identity (PID, start
time, launch nonce). RPCs defined in `src/main/daemon/types.ts` include `createOrAttach`, `write`,
`resize`, `detach`, `kill`, `listSessions`, `getSnapshot`, `shutdownIfIdle`, and `ping`.

The renderer stores each pane's `sessionId` in its saved layout. On relaunch it calls
`createOrAttach(sessionId)`: the daemon attaches to the PTY if it is still alive, or creates a new
one if not.

## 3. Quit and relaunch

On quit, `src/main/startup/main-process-quit.ts` calls `disconnectDaemon()`, not
`shutdownDaemon()`. A comment in `daemon-provider-state.ts` states the intent directly:
disconnect without killing, so the daemon survives app quit and sessions stay warm for reattach.
The one exception is a dev build whose parent process died; that path runs a full shutdown.

On launch, `daemon-out-of-process-launcher.ts` first tries to connect to and adopt an existing
daemon, reconciling the stored PID record, and only forks a new one if that fails. If two
instances race to start a daemon, the loser adopts the winner's daemon instead of retrying.

The protocol version is encoded in the socket filename. `daemon-legacy-adapters.ts` lets a newer
app version drive an older running daemon, so an app update does not force-kill existing
terminals. The headless server, `orcad`, also only disconnects on its own shutdown.

## 4. Screen restore on reattach

The daemon feeds each PTY's output into an `@xterm/headless` terminal instance with the
serialize addon (`headless-emulator.ts`). This keeps an exact model of the screen and terminal
modes. On reattach, the client requests a snapshot of this model and repaints it, rather than
replaying the raw byte stream.

## 5. Cold restore after a reboot or daemon crash

Screen snapshots are checkpointed to disk at `<userData>/terminal-history/`
(`daemon-pty-checkpoint-persistence.ts`, `history-manager.ts`). Sessions left over from an
unclean exit can be recovered from these checkpoints.

On the next start, Orca paints the saved screen and relaunches agent sessions using their resume
command. For example, Claude is relaunched with its provider session id
(`src/main/claude/claude-tui-resume-launch.ts`, and on the renderer side,
`pty-connection-cold-restore-*`). The underlying process is new, but scrollback and the agent's
conversation history come back.

## 6. Lessons from the daemon's design

Orca's `src/main/daemon/AGENTS.md` names endpoint ownership as the hardest part of the daemon:
deciding who may replace or delete the socket path. Its rules:

1. Never remove the endpoint on shutdown. Node's `net.Server.close()` unlinks the socket path
   with no ownership check. If a replacement daemon has already bound a live socket there, this
   deletes its path and leaves its PTYs unreachable by any client.
2. Only a `connected` result means the endpoint is occupied. Only `refused` or `missing` proves
   the previous daemon is dead. A timeout or `EPERM` proves nothing.
3. To take over the endpoint: bind a private `.p<hex>` socket name, `link` it onto the canonical
   path exclusively, and on `EEXIST` prove the incumbent is dead before proceeding. Then `rename`
   onto the canonical path in one syscall. Never unlink and then link separately, since that
   leaves a gap with no listener.
4. Don't identify daemon instances by file `birthtimeMs`.
5. There is no sweeper process cleaning up stale sockets.

The file records 23 defects found across seven review rounds of the earlier design, all
variations of the same check-then-act race on the endpoint.

## Relevance to us

A simpler way to get most of this survival behavior is to run each session inside `tmux` or
`dtach` and reattach to it. That does not survive a system reboot, so the snapshot-and-resume
step described above would still be needed for that case. Worth reading in full if we build
session persistence into our own tools.

## Driving live sessions from a dispatcher

Live checks against the installed Orca 1.4.211 and tmux 3.6a, examined 2026-09-25. Unlike the
survey above, this section is grounded in running the CLI and reading the installed app's own
bundled source (`/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/`), not in
reading Orca's GitHub repo.

### Orca CLI surface

- **Verified.** Commands: `terminal list`, `show`, `read`, `send`, `wait`, `create`, `close`.
  `orca agent-context --json` prints the full schema.
- **Verified.** Transport is a private Unix socket plus a token file under
  `~/Library/Application Support/orca`. Drive it through the CLI, not the socket directly.

#### find

- **Verified.** `orca terminal list --worktree path:<cwd> --json` returns terminals scoped to a
  worktree, with fields `handle`, `worktreePath`, `agentIdentity`, `connected`, `writable`,
  `lastOutputAt`, `preview`. There is no PID or command field.
- **Verified.** Titles are unreliable: creating a terminal with `--title sd-probe --command bash`
  showed the title revert to the cwd once the command exited, even though the terminal stayed
  `connected: true, writable: true`. A terminal outliving its agent looks exactly as live as one
  still running it. Check `agentIdentity` (absent or `null` for a plain shell), not title or
  connectedness, to tell whether an agent is actually present.

#### send

- **Verified.** `orca terminal send --terminal <handle> --text '<text>' --enter --json` returns
  `{ ok, result: { send: { accepted, prompt: { stages, provider } }, warnings? } }`. There is no
  `--cwd` flag; the handle comes from `orca terminal list`. A handle from before an Orca restart
  fails with `error.code: "terminal_handle_stale"`. Against a plain shell, `stages` was
  only `["input_accepted"]`, `provider` was `"unsupported"`, and the response carried a warning:
  "input was accepted, but this provider cannot report delivery. Inspect the terminal before
  retrying." A `turn_started` delivery stage only exists for a recognized agent provider.
- **Verified**, read from the CLI's own bundled source (not exercised live against an agent in this
  pass): against a recognized agent terminal, `terminal send --text --enter` sets `agentPrompt`,
  wraps the text in bracketed paste, and sends `\r` separately roughly 500ms or more later
  (`shared/agent-prompt-injection.js`). It replaces a literal ESC byte with the string `<ESC>`.
  `--wait-submit <seconds>` (at most 3600) waits for the `turn_started` stage;
  `--retry-request <id>` retries an ambiguous send safely; `--interrupt` exists as a separate
  action.

#### read / idle

- **Verified.** `orca terminal read --screen --json` returns `result.terminal` with
  `status: running`, a `tail[]` of screen lines, three cursors (`oldestCursor`, `nextCursor`,
  `latestCursor`), and `source: "screen"`.
- **Verified.** `orca terminal wait --for tui-idle --timeout-ms <ms> --json` against a plain shell
  (nothing to go idle) returned `{ ok: false, error: { code: "timeout" } }` — an error envelope,
  not a `{ satisfied: false }` result. Treat a timeout as "unknown/busy," not as a confirmed busy
  state.
- **Verified.** `orca terminal show --json` includes `orphaned`, `worktreePath`, `branch`,
  `ptyId`, `incarnationId`.

#### open / close

- **Verified.** `orca terminal create --worktree path:<cwd> --title <title> --command <cmd> --json`
  returns `result.terminal` with `handle` (`term_…`), `tabId`, `paneKey`,
  `ptyId` (`<worktreeId>@@<hash>`), `worktreeId` (`<repoId>::<path>`), `title`,
  `executionHostId: "local"`, `incarnationId`, `hostPlatform`, `surface: "visible"` — without
  `--focus`, it does not steal focus.
- **Verified.** `--command` runs inside the user's login shell (fish, here), which then runs the
  given command; when the command exits, the pane stays open at the shell prompt rather than
  closing.
- **Verified.** `orca terminal close --json` returns `{ ptyKilled: true }`.

#### lifecycle

- **Verified**, from the CLI's own bundled source: handles are runtime-scoped — re-list after an
  Orca restart, or on a `terminal_handle_stale` error.

### tmux

See [`tmux.md`](tmux.md) for the full write-up: create, tag, discover, send, read, and
name, all checked live against tmux 3.6a. In short: tmux gives the same shape of primitives Orca
does, with no app-aware idle signal (only the coarser `monitor-silence`/`alert-silence` quiescence
timer) and no cross-reboot persistence of its own.

### Engine notes

The per-harness research (claude, codex and pi, kept outside this package) has one note per engine,
each covering: open with a known id and name, resume by id with a prompt, native send to a live
session (if any), headless mode, and the Orca identity value. Highlights:

- `claude` has no way to inject into a running session, but does have its own native
  background-session mechanism (`--bg`, `claude agents --json`, `attach`, `logs`, `stop`, `rm`)
  independent of any host.
- `codex` sessions live behind a shared local app-server daemon; `codex queue --thread --message`
  is described as delivering to "an existing session," but whether that reaches a live TUI is
  unconfirmed — the installed binary has no bundled source to check.
- `pi --mode rpc` is a full JSON-over-stdio protocol, but only for a process the caller spawns and
  holds stdin for, not a way to attach to an already-running `pi` TUI.
- In Orca's own source, `codex` and `pi` are both `RESUMABLE_TUI_AGENT`s. Only `claude` and
  `codex` get Orca's structured `AgentSessionProviderHandle`; `pi` resumes through a plain argv
  build that needs a transcript file path, not just a session id.

### Recommended shape

A host module exposes `find`, `send`, `open`, and `read`. An engine module supplies
`openArgv(prompt, id, name)`, `resumeArgv(id, prompt)`, and an optional
`nativeSend(id, message)` (codex's `queue`, possibly pi's rpc mode when the dispatcher owns the
process). The session record is `{ cwd, host, handle | pane, engine, sessionId, tag }`. Routing
order:

1. A live terminal exists for the session → host `send`.
2. The engine has a native send → use it.
3. Neither → `resume` in a new terminal.
4. No prior session → a fresh `open`.

### Remaining unknowns

- Whether `ptyId` and the handle stay stable across an Orca restart.
- How `tui-idle` is actually detected internally (the CLI's `wait` gives a boolean-ish result, not
  the heuristic behind it).
- What happens when a send targets a Claude session that is mid-turn.
- Whether `codex queue` reaches a live TUI (see the codex
  harness research, kept outside this package).
