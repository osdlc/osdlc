---
id: D-08
type: decision
state: accepted
created: 2026-10-13
---

# D-08: Shell strings

## Decision

- `argv` is never parsed by a shell. Spaces, quotes and `$()` in an argument
  reach the binary unchanged.
- Only `runShell`, `runShellAsync` and the shell runners run a shell string.
  They run it as `sh -c -- <verb>`. `scriptName` sets `$0` and `args` set
  `$1` and on.

```ts
import { runShell, spawnRunner } from '@osdlc/command-seam'

const cwd = process.cwd()
const file = 'notes; rm -rf ~'
spawnRunner('wc').run(['-l', file], { cwd }) // wc gets the name as one argument
runShell('wc -l < "$1"', { cwd, args: [file] }) // the shell reads it as data, not code
```

## Why

- Keeping the shell out of `argv` removes a whole class of quoting and
  injection bugs.
- The `--` stops `sh` from reading a verb that starts with `-` as an option.

## Consequences

- A caller that needs pipes or `&&` uses the shell runners on purpose, and
  passes user input through `args`, not the verb.
- `shellQuote` and `shellJoin` quote words for a POSIX shell when a caller
  must build a command line.
