---
title: Testing
description: Test code that opens sessions without opening any, with a fake command runner or a fake host.
---

Code that opens agent sessions should be testable without tmux, an editor or an
agent installed. There are two ways, depending on what you want to check.

## Check what a host would run: a fake command runner

Every host runs its app's CLI through a `CommandRunner` from
[`@osdlc/command-seam`](https://www.npmjs.com/package/@osdlc/command-seam), and
every factory takes one as `runner`. Give it a fake that records the calls:

```ts
import type { CommandRunner } from '@osdlc/command-seam'
import { makeTmuxHost, requirePart } from '@osdlc/agent-seat'

const calls: string[][] = []
const runner: CommandRunner = {
  run: (argv) => {
    calls.push(argv)
    return { exitCode: 0, stdout: '', stderr: '' }
  },
}

const tmux = makeTmuxHost({ runner, available: () => true })
requirePart(tmux, 'session')({
  cwd: '/work',
  harness: 'claude',
  binary: 'claude',
  prompt: 'hi',
  title: 't',
  sessionId: 'abc',
})

// calls[0]: ['new-session', '-d', '-s', 'sd-abc-ba7816bf', '-c', '/work', '--', 'claude', '--', 'hi']
```

The fake answers each call, so it can also play the app's side: return
`exitCode: 1` from `has-session` to test "no such session", or a JSON list from
`wezterm cli list` to test pane matching. The package's own tests do this for
every host.

## Check your own logic: a fake host

When the code under test only decides which host to use and what to send, give
it a `Host` you write yourself. Every part is optional, so a fake carries only
what the test needs:

```ts
import { type Host, type HostRegistry, hostRegistry } from '@osdlc/agent-seat'

const sent: string[] = []
const fakeTmux: Host = {
  name: 'tmux',
  platforms: 'all',
  available: () => true,
  send: (req) => {
    sent.push(req.text)
    return { accepted: true, ack: false }
  },
}

const hosts: HostRegistry = { ...hostRegistry({ runtimeDir: '/tmp/test' }), tmux: fakeTmux }
```

## State in tests

Hosts that remember panes write under `runtimeDir`. Give each test file its own
temporary directory, so one test's sessions are not visible to the next:

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const runtimeDir = mkdtempSync(join(tmpdir(), 'my-tool-test-'))
```
