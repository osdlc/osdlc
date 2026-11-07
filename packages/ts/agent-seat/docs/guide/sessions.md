---
title: Working with open sessions
description: Send text into a running agent, find, focus, read and close it, and what a send receipt means.
---

Once a session is open, a program often needs to reach it again: a review bot
posts feedback into the agent that wrote the change, a scheduler checks whether
the agent is still running, a person's "stop" button closes it. These are the
`send`, `find`, `focus`, `capture` and `close` parts.

## Address a session

Every one of these calls takes a `FindQuery`: the session's working directory,
and optionally the id you gave it when you opened it.

```ts
const query = { cwd: '/work/my-repo', sessionId: 'todo-1' }
```

With `sessionId`, the host reaches the pane it opened for that id, even when
another session runs in the same directory. Without it, the host picks the
session at `cwd`. That is fine when one session per directory is the rule, and
ambiguous otherwise.

How a host finds the pane again depends on the app:

| Host | How it remembers the pane |
|---|---|
| `tmux` | Names the tmux session after the id's first 12 characters and a hash of the whole id (`sd-todo-1-d7071d09`) |
| `wezterm`, `orca`, `herdr` | Writes `<runtimeDir>/hosts/<name>/sessions/<id prefix>-<hash>.json` with the id and the app's pane id |
| `otty` | Puts a tag derived from the id in the tab title |
| `vscode` | Sends the id to the companion extension, which binds the terminal |
| `cmux`, `jetbrains` | Cannot bind a pane to an id; they use `cwd` |

tmux and otty name a session by the id's first 12 characters followed by a
hash of the whole id, so `build-step-001` and `build-step-002` get separate
sessions.

A remembered pane id is only a hint. The host checks it against the app's live
list before it acts, because panes close and a restarted app reissues ids.

## Send text into a running agent

```ts
const receipt = requirePart(hosts.tmux, 'send')({
  cwd: '/work/my-repo',
  sessionId: 'todo-1',
  text: 'The tests in auth.test.ts fail; please fix them.',
})
```

The text is typed into the session as if the person typed it, then submitted.
Multi-line text stays one message.

`send` never throws. It answers with a `SendReceipt`:

| `accepted` | `ack` | `uncertain` | Meaning | What to do |
|---|---|---|---|---|
| `false` | `false` | | Nothing was sent: no session, or the app refused | Try another route, or tell the person |
| `true` | `true` | | The app confirmed the agent took the message (Orca, herdr) | Done |
| `true` | `false` | | Sent, but the app cannot confirm it (tmux, WezTerm, VS Code, JetBrains) | Treat as unconfirmed; check later with `capture` |
| `true` | `false` | `true` | The app accepted it but cannot say whether it landed | Do not send it again: it may be there |

`host.acksSend` tells you in advance whether a host can ever return `ack: true`.

When you name the harness, a host that can tell which agent runs in each pane
sends only to the one matching pane, and refuses when there is not exactly
one:

```ts
requirePart(hosts.orca, 'send')({ cwd: '/work/my-repo', harness: 'codex', text: 'continue' })
```

## Find, focus, read and close

```ts
const found = requirePart(hosts.tmux, 'find')({ cwd: '/work/my-repo' })
// [{ cwd: '/work/my-repo', harness: null, alive: true, lastOutputAt: null, handle: 'sd-todo-1-d7071d09' }]

requirePart(hosts.tmux, 'focus')(query) // true: switched to it (inside tmux)
requirePart(hosts.tmux, 'capture')(query) // the pane's visible text, or null
requirePart(hosts.tmux, 'close')(query) // true: the pane and the agent in it are gone
```

These calls never throw. A failed call means "no session": `find` returns `[]`,
`focus` and `close` return `false`, and `capture` returns `null`.

`close` is stricter than the others. Given a `sessionId`, it closes only the pane
bound to that id and never falls back to "whatever runs in this directory", so
it cannot close a session the person started by hand.

## Wait for a session to finish

A scheduled job sometimes wants a visible session and its exit code. The
`tmux` host can hold the launch until the agent exits:

```ts
import { hostCanWait, WAIT_TIMEOUT_EXIT } from '@osdlc/agent-seat'

if (hostCanWait('tmux')) {
  const { exitCode } = requirePart(hosts.tmux, 'session')({
    cwd: '/work/my-repo',
    harness: 'codex',
    binary: 'codex',
    prompt: 'Run the nightly dependency check.',
    title: 'nightly',
    wait: { runId: 'nightly-2026-11-07', timeoutMs: 30 * 60_000 },
  })
  if (exitCode === WAIT_TIMEOUT_EXIT) console.log('killed at the deadline')
}
```

The session is named after the run, so a person can watch it with
`tmux attach -t sd-nightly-2026-11-07`.
