---
title: Hosts
description: What each built-in host needs, which parts it has, and how it behaves.
---

Each host drives one app through that app's own command-line tool or
companion. This page lists what each needs and where it differs. The research
behind each host, with what was run against the real app and what comes only
from its documentation, is in [`../planning/research/`](../planning/research/).

| Host | Platforms | Needs | send acks | Binds a pane to a session id |
|---|---|---|---|---|
| `terminal` | all | nothing | no `send` | no |
| `tmux` | macOS, Linux | `tmux` on `PATH` | no | yes, by session name |
| `wezterm` | all | `wezterm` on `PATH` (`wezterm.exe` on Windows) and a running WezTerm | no | yes, by pane id |
| `cmux` | macOS | `cmux` on `PATH` | no | no |
| `herdr` | macOS, Linux | `herdr` on `PATH` | yes | yes, by pane id |
| `orca` | macOS | `orca` on `PATH`, or the Orca app's bundled CLI | yes | yes, by terminal handle |
| `otty` | macOS | `otty` on `PATH` | no | yes, by a tab-title tag |
| `vscode` | all | a VS Code, Cursor or Windsurf window with the `sdlc-host` extension | no | yes, by the extension |
| `jetbrains` | macOS | a JetBrains IDE with the companion plugin, and `curl` | no | no |

## `terminal`

Runs the agent in the caller's own terminal and returns when it exits. It is the
only host that blocks, and the only one with nothing to find or send to
afterwards. Use it for a person running your tool by hand. Do not use it from a
server process that has no terminal of its own.

## `tmux`

Opens a detached tmux session named after the id, `sd-<first 12 characters>-<hash>` (or
`sd-<hash of cwd>` with no id), and returns at once. `focus` switches the current tmux client to it,
so it works only when your process runs inside tmux. `send` pastes the text through a tmux buffer
and then presses Enter, so multi-line messages arrive whole. tmux cannot tell when an agent has read
its input, so `ack` is always false. It is the only host that can wait for a session to exit (see
[Working with open sessions](./sessions.md#wait-for-a-session-to-finish)).

## `wezterm`

Spawns a pane with `wezterm cli spawn` and remembers its id. `send` and `close`
act only on a pane this host spawned and that is still live, so they never touch
a pane the person opened.

## `herdr`, `orca`

Both apps know which agent runs in which pane and confirm that the agent took a
message, so `send` can return `ack: true`. Orca can also tell harnesses apart, so
`send` with a `harness` targets the one matching terminal.

## `cmux`, `otty`

Workspace and tab apps on macOS. cmux cannot bind a pane to an id, so it works
by directory: `send` types only when exactly one workspace there runs an agent,
and `close` acts only when exactly one workspace is there.

## `vscode`, `jetbrains`

These drive an editor through a companion that runs inside it:

- `vscode`: the `sdlc-host` extension opens a private local socket per window and
  registers the window under `<runtimeDir>/hosts/vscode/`.
- `jetbrains`: a plugin serves a small HTTP API on `127.0.0.1` and registers each
  IDE under `<runtimeDir>/hosts/jetbrains/`, with a per-IDE token.

The host picks the window whose open folder contains the session's directory,
the deepest one first. The companions are not published yet, so outside the
project that builds them these hosts report `available() === false`.

The JetBrains host can also open a project when no IDE has the directory open
(`openWorkspace`); the IDE then asks the person to trust it. `ensureWorkspace`
calls it for you when you turn workspace opening on:

```ts
import { ensureWorkspace } from '@osdlc/agent-seat'

ensureWorkspace(hosts.jetbrains, '/work/my-repo', true, (line) => console.log(line))
// opening /work/my-repo in WebStorm… (approve the trust prompt in the IDE if it asks; waiting up to a minute)
```

## On Windows

`terminal`, `wezterm` and `vscode` run on Windows. A terminal there runs
PowerShell, so a command line with environment variables is built for
PowerShell. Windows has not been run end to end yet.
