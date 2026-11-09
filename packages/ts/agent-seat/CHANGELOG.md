# @osdlc/agent-seat

## 0.7.2

### Patch Changes

- Updated dependencies [3a8af1e]
- Updated dependencies [3d4a6d7]
- Updated dependencies [6422022]
  - @osdlc/agent-call@0.10.0

## 0.7.1

### Patch Changes

- 29e2fb1: First public release. Opens an interactive coding-agent session (`claude`, `codex`, `cursor`, `pi`, `opencode`, `antigravity`) in the terminal app, multiplexer or editor a person already uses: the caller's own terminal, tmux, WezTerm, cmux, herdr, Orca, otty, VS Code or a JetBrains IDE. One host contract in optional parts (`session`, `terminal`, `send`, `find`, `focus`, `capture`, `close`, `openWorkspace`); `requirePart` returns the part or throws `HostPartMissing`. `hostRegistry({ runtimeDir })` builds every host, and hosts that keep state keep it under that directory. Every shell-out goes through an injected `@osdlc/command-seam` runner. The `vscode` and `jetbrains` hosts, their companion plumbing, the tmux attach helpers and `hostCanWait` are experimental. Compared with the unpublished 0.7.0, the tmux session name, the otty title tag and the session-pane file name now end in a hash of the session id, and WezTerm keeps one `spawned/<paneId>.json` per pane instead of `panes.json`; a session opened by an earlier build is not found by `send`, `find` or `close`. The versions before 0.7.1 were never published; the history in this file rebuilds them from the git history.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.7.0] - 2026-10-22 (unpublished)

#### Added

- The `openWorkspace` part, `OpenWorkspaceQuery`, `OpenedWorkspace` and `ensureWorkspace`;
  `JetbrainsSettings`.

#### Changed

- Breaking: the JetBrains host requires companion plugin protocol 2 and skips older plugins.

### [0.6.5] - 2026-10-19 (unpublished)

#### Fixed

- `harnessAvailable` finds the harness binary with the same PATH lookup on every platform.

### [0.6.4] - 2026-10-18 (unpublished)

#### Added

- `SessionRequest.wait`, `WaitRequest`, `WAIT_TIMEOUT_EXIT` and `hostCanWait`: tmux can hold a
  launch until the session exits.

### [0.6.3] - 2026-10-16 (unpublished)

#### Added

- `FindQuery.harness`: Orca delivers to the one terminal running that harness.

### [0.6.2] - 2026-10-11 (unpublished)

#### Added

- The `close` part; `SendRequest` and `FindQuery` take `sessionId`, and hosts bind a pane to the
  session id it was opened for.

### [0.6.1] - 2026-10-11 (unpublished)

#### Added

- `SessionRequest.wrap`: run the harness under a wrapper command.

### [0.6.0] - 2026-10-11 (unpublished)

#### Changed

- Breaking: `harnessArgv(harness, binary, prompt, ...)` and `harnessAvailable(harness, binary)`
  take the binary; `SessionRequest.binary` is required; `Harness` is any tool id, validated by
  `HarnessSchema`. Model, effort and launch-mode fields on `SessionRequest`.

### [0.5.0] - 2026-10-11 (unpublished)

#### Added

- Hosts `herdr`, `otty`, `wezterm`, `vscode` and `jetbrains`; the `capture` part;
  `supportsPlatform`; Claude hook settings (`claudeHookSettings`, `CLAUDE_HOOK_EVENTS`).

#### Changed

- Breaking: `Host.platforms` is required; `SendReceipt.deliveryKnown` is now `ack`, with
  `uncertain`.

### [0.4.1] - 2026-10-10 (unpublished)

#### Fixed

- Hosts read command results through the command seam's helpers; no behaviour change.

### [0.4.0] - 2026-10-07 (unpublished)

#### Changed

- Breaking: the `session` part returns `harnessSessionId` instead of `hostSessionId`.

### [0.3.4] - 2026-10-06 (unpublished)

#### Added

- Claude session flags: `ClaudeSessionFlagsSchema`, `claudeSessionArgv`, `claudeResumeArgv`, and
  plugins and a system prompt on `SessionRequest`. An `env` entry can unset a variable.

### [0.3.3] - 2026-10-06 (unpublished)

#### Added

- The `focus` part, `SessionRequest.env`, `withEnv` and `insideTmux`. Orca sends by terminal
  handle.

### [0.3.2] - 2026-09-28 (unpublished)

#### Added

- `makeTerminalHost`, taking a streaming runner.

### [0.3.1] - 2026-09-28 (unpublished)

#### Added

- `walkRolloutFiles`.

### [0.3.0] - 2026-09-28 (unpublished)

#### Changed

- Breaking: `SessionRequest.engine` is `harness`, and hosts are wrappers that run any harness; the
  per-harness host names are gone. The tmux host, the `pi` harness, the `send` and `find` parts,
  and `HostRegistry`, `SendReceipt` and `FoundSession`.

### [0.2.0] - 2026-09-27 (unpublished)

#### Changed

- Breaking: the `session` part returns `{ exitCode, hostSessionId }`; `HostNameSchema`.

### [0.1.0] - 2026-09-10 (unpublished)

#### Added

- The host contract (`Host`, `HostParts`, `requirePart`, `HostPartMissing`, `HOST_NAMES`,
  `onPath`) with the `terminal`, `orca` and `cmux` hosts.
