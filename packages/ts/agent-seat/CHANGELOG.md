# @osdlc/agent-seat

## 0.10.1

### Patch Changes

- Updated dependencies [1ba6088]
  - @osdlc/typed-git@0.20.0

## 0.10.0

### Minor Changes

- 7165bf2: `harnessArgv`, `harnessAvailable` and `SessionRequest.binary` accept a launcher prefix such as `['npx', '-y', 'claude']` as well as one binary word; the prefix leads the argv and the session flags follow it. The pure per-host argv builders (`orcaCreateArgv`, `cmuxCreateArgv`, `ottyCreateArgv`, `herdrWorkspaceCreateArgv`, `weztermSpawnArgv`, `tmuxCreateArgv` and their send, focus, close, list and read companions) are now exported from the package entry.

## 0.9.0

### Minor Changes

- d1f8887: cmux host: `makeCmuxHost({ binary })` names the `cmux` binary (or `null` for none) instead of finding it only on PATH, and a launch with a `sessionId` records `agent-seat:<slug>` in the workspace's `--description`. `find`, `send`, `focus`, `capture` and `close` with that `sessionId` pick the workspace carrying the marker, so two sessions in one worktree can be told apart; without a marker match they fall back to the working directory as before.
- 07a9f42: `CommandRequest` gains `env`, applied by every host with `withEnv`, so a workspace shell can carry variables without hiding exports inside `argv`. New `envPrefixLine(argv, env)` builds the plain POSIX `K=V cmd` prefix as a string, so a shell function or alias still runs where `env K=V cmd` would not. New `commandArgv(req)` returns a request's argv under its env.
  
  `withEnv` now refuses, on POSIX too, a variable name that is not a plain identifier (it used to pass any name to `env`), and `commandArgv` refuses an empty argv.
- 9579dac: Add the `window` host: it opens a new GUI terminal window running the harness (Terminal.app through `osascript` by default, or a caller-supplied `WindowOpener`) and returns as soon as the window is open. `makeWindowHost`, `windowHost`, `terminalAppArgv`, `windowShellCommand` and `WindowOpener` are exported, and `'window'` joins `HOST_NAMES`. It cannot wait for the window's process to exit.

### Patch Changes

- fa8118b: `harnessArgv`, `hasInteractiveArgv`, `claudeSessionArgv`, `claudeResumeArgv`, `claudeHookSettings` and `CLAUDE_HOOK_EVENTS` now delegate to `@osdlc/agent-call`, which owns each CLI's command line. Same exports and the same argv.
- Updated dependencies [fa8118b]
- Updated dependencies [63b5800]
- Updated dependencies [6d37030]
- Updated dependencies [c8470d6]
- Updated dependencies [0ce8abc]
- Updated dependencies [9c0f5ae]
  - @osdlc/agent-call@0.15.0
  - @osdlc/command-seam@0.15.1
  - @osdlc/typed-git@0.19.0
  - @osdlc/detect-harness@0.7.4

## 0.8.1

### Patch Changes

- 0f4ff65: README: say why `engines.node` is `^22.22.2 || ^24.15.0 || >=26.0.0`. It is the range of the dependency `@osdlc/typed-git` (from its dependency `hosted-git-info`), and a package never declares a wider range than a dependency's. The range is unchanged.
- Updated dependencies [b0ff1b3]
- Updated dependencies [cb56f16]
  - @osdlc/typed-git@0.18.0

## 0.8.0

### Minor Changes

- 9862f4b: Orca host: `SessionRequest` and `CommandRequest` take `focus` (default true); `focus: false` opens the terminal in the background. The create no longer passes `--focus`, which can time out while Orca adopts a worktree with the terminal already open; the host switches to the new terminal afterwards, once the create returned its handle. `parseOrcaCreatedHandle` also reads `result.handle` and `result.terminalId`, and `find`, `send`, `focus` and `close` list again with `--limit` of `totalCount` when Orca truncated the first page of 100. `orcaFindArgv` takes an optional `limit`.

## 0.7.9

### Patch Changes

- Updated dependencies [6236a97]
  - @osdlc/typed-git@0.17.0

## 0.7.8

### Patch Changes

- Updated dependencies [cde222c]
  - @osdlc/typed-git@0.16.0

## 0.7.7

### Patch Changes

- Updated dependencies [6c329b7]
  - @osdlc/agent-call@0.14.0

## 0.7.6

### Patch Changes

- Updated dependencies [9a1d13c]
  - @osdlc/agent-call@0.13.0

## 0.7.5

### Patch Changes

- Updated dependencies [912296d]
  - @osdlc/typed-git@0.15.0

## 0.7.4

### Patch Changes

- Updated dependencies [20dfeb4]
- Updated dependencies [20dfeb4]
  - @osdlc/agent-call@0.12.0
  - @osdlc/detect-harness@0.7.2

## 0.7.3

### Patch Changes

- Updated dependencies [e1a5941]
- Updated dependencies [e1a5941]
- Updated dependencies [cb8eafc]
  - @osdlc/agent-call@0.11.0
  - @osdlc/command-seam@0.15.0
  - @osdlc/typed-git@0.14.0
  - @osdlc/detect-harness@0.7.1

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
