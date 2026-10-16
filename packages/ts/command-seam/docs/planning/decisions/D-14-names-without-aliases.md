---
id: D-14
type: decision
state: accepted
created: 2026-10-13
---

# D-14: Names without aliases

## Decision

- Options and types are named for what the caller wants:
  - `processGroup`, not `detached` ([D-07](D-07-process-groups.md));
  - `scriptName` for a shell script's `$0`, in `ShellPositionals`;
  - `ManagedProcessRunOptions` for the managed-process runner's options,
    matching the other runners' `...RunOptions`.
- The managed-process runner requires `cwd`, like every other runner.
- A rename before the first release carries no alias for the old name.

```ts
import { runShell } from '@osdlc/command-seam'

// Prints "greet: hi". `scriptName` is $0 and `args` are $1 and on.
runShell('echo "$0: $1"', { cwd: process.cwd(), scriptName: 'greet', args: ['hi'] })
```

## Why

- One naming pattern across the runners makes the next one easy to guess.
- A required `cwd` everywhere means no runner falls back to the parent's
  directory by accident.
- Nothing was published before `0.3.0`, so no user depends on an old name.
  An alias would only add surface to keep.

## Consequences

- The first release's CHANGELOG entry uses the new names only.
- Later renames follow semver and the tiers in
  [D-02](D-02-version-line-and-stability.md).
