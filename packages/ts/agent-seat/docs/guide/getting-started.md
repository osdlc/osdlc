---
title: Getting started
description: Hosts, harnesses and parts, and how to open your first agent session.
---

`@osdlc/agent-seat` opens an interactive coding-agent session where a person
already works, and lets your program talk to it afterwards. This page explains
the three ideas the API is built on, then opens a session.

## Three ideas

**A host is where the session opens.** It is an app the person already has: the
terminal they are typing in, a tmux session, a WezTerm pane, an Orca window, a
VS Code terminal. Each built-in host is a `Host` object with a `name` such as
`'tmux'`.

**A harness is the agent that runs in it.** It is a coding-agent CLI: `claude`,
`codex`, `cursor-agent`, `pi` or `opencode`. The two choices are independent:
every host runs any harness. The same request opens Codex in tmux or Claude in
WezTerm; only the `harness` and `binary` fields change.

**A host offers parts.** A part is one thing a host can do:

| Part | What it does |
|---|---|
| `session` | Open an agent session and start it with a first message |
| `terminal` | Run any command in a new visible terminal |
| `send` | Type text into a session that is already open |
| `find` | List the sessions open in a directory |
| `focus` | Bring a session to the front |
| `capture` | Read what a session's screen shows |
| `close` | Close a session's pane |
| `openWorkspace` | Open a project in the app first (JetBrains) |

Not every app can do everything. VS Code has no API to read a terminal back, so
the `vscode` host has no `capture`. Every part is optional on the `Host` type.
Ask for the part you need with `requirePart`. If the host lacks it, you get a
`HostPartMissing` error that names the host and the part. You never get a silent
fallback to another host, because the person chose this one.

```ts
import { HostPartMissing, requirePart } from '@osdlc/agent-seat'

try {
  const capture = requirePart(hosts.vscode, 'capture')
} catch (e) {
  if (e instanceof HostPartMissing) {
    console.log(e.message) // host 'vscode' cannot read the recent screen text of a session
    console.log(e.host, e.part) // 'vscode' 'capture'
  }
}
```

## Open a session

`hostRegistry` builds every built-in host. Some hosts remember which pane
belongs to which session, and the IDE companions register their windows. Both
keep small files under a directory you choose, `runtimeDir`. Use one directory
per application, private to the user, and the same one in every process that
should see the same sessions.

```ts
import { hostRegistry, requirePart, supportsPlatform } from '@osdlc/agent-seat'

const hosts = hostRegistry({ runtimeDir: '/home/me/.local/state/my-tool' })

const tmux = hosts.tmux
if (!supportsPlatform(tmux)) throw new Error('tmux does not run here')
if (!tmux.available()) throw new Error('tmux is not installed')

const { exitCode, harnessSessionId } = requirePart(tmux, 'session')({
  cwd: '/work/my-repo',
  harness: 'claude',
  binary: 'claude',
  prompt: 'Read TODO.md and fix the first item.',
  title: 'todo 1',
  // Your id for this session; later calls address it by the same `sessionId`.
  sessionId: 'todo-1',
})
```

What happens:

1. The host builds the harness's command line with `harnessArgv`, here
   `claude -- 'Read TODO.md and fix the first item.'`.
2. It opens a detached tmux session in `/work/my-repo` running that command, and
   returns at once with `exitCode` 0. Only the `terminal` host blocks until the
   agent exits, because it runs in your own terminal.
3. `harnessSessionId` is the agent's own session id when the harness exposes one
   (codex writes it to a file the host can find). It is `null` otherwise.

`supportsPlatform(host)` says whether the host runs on this operating system at
all. `available()` says whether it can open a session right now: the app is
installed, and for VS Code and JetBrains, a window with the companion answers.

## Choose a host

A tool usually lets the person pick a host and falls back to a default. Check
what you need before you open anything, so the person gets one clear error:

```ts
import { HOST_NAMES, type HostName } from '@osdlc/agent-seat'

function pickHost(choice: string | undefined): HostName {
  const name = (choice ?? 'terminal') as HostName
  if (!HOST_NAMES.includes(name)) throw new Error(`unknown host ${name}`)
  const host = hosts[name]
  if (!supportsPlatform(host)) {
    throw new Error(`${name} does not run on ${process.platform}: ${host.platformHint?.[process.platform] ?? ''}`)
  }
  if (!host.available()) throw new Error(`${name} is not available`)
  return name
}
```

Decide behaviour from what a host declares, not from its name. `host.send`
existing means you can send; `host.acksSend` means a send can confirm delivery.
A branch on `name === 'tmux'` breaks when the next host is added.

## Next

- [Working with open sessions](./sessions.md): send, find, focus, capture and
  close, and what a send receipt means.
- [Hosts](./hosts.md): what each host needs and how it behaves.
- [Testing](./testing.md): drive a host with a fake command runner, or use a fake
  host.
