---
title: Context assembly
description: Build a headless run's working set from a real tree with intersect/fs — the disk layer.
---

A headless script — an agent run, a batch job, a CI step — is most useful when it starts
from the right slice of the repository. That slice is usually expressed as patterns:
"everything under `src/api/**` and the matching tests." The caller wants the concrete paths
that fall in that scope, to hand the model as context ([[DR-0011]]).

This is the one job that needs the filesystem. `@osdlc/intersect/fs` is the only layer that reads
disk, and the only one that pulls a globber (`tinyglobby`). It enumerates the real tree, then
filters every entry through the pure path API — so the dialect is identical to L0/L1: a bare
path is an exact match, a subtree needs `**`, and the globber's own dialect never leaks into
the result.

## filesInScope — the context slice

`filesInScope` returns the on-disk files matching a scope, sorted and cwd-relative (absolute
with `{ absolute: true }`).

```ts
import { filesInScope } from "@osdlc/intersect/fs";

const context = await filesInScope(["src/api/**", "src/db/**"], { cwd: repoRoot });
```

`context` — e.g. `["src/api/routes/list.ts", "src/api/user.ts", "src/db/pool.ts", ...]`.

A scope is a set of **globs**, not of filenames. The enumerated names are compared literally, so a
file really called `pages/[id].vue` is that name and not a character class — and reaching it takes
an escaped pattern, `pages/\[id\].vue`. Feeding a literal repo path in as a scope drops any file
whose name contains `*?[]{}`.

## resolveIntersection — files in both scopes

```ts
import { resolveIntersection } from "@osdlc/intersect/fs";

const both = await resolveIntersection(["src/**/*.ts"], ["src/api/**"], { cwd: repoRoot });
```

`both` — e.g. `["src/api/routes/list.ts", "src/api/user.ts", ...]` (no `*.md`, no non-api dirs).

## End to end — assemble a run's working set

`FsOptions` extends the matching `Options` with `cwd`, `ignore`, `onlyFiles` (default `true`),
and `absolute` (default `false`).

```ts
import { filesInScope } from "@osdlc/intersect/fs";

async function contextFor(scope: string[], repoRoot: string): Promise<string[]> {
  return filesInScope(scope, { cwd: repoRoot, ignore: ["**/*.test.ts", "**/node_modules/**"] });
}

const files = await contextFor(["src/api/**", "src/db/schema.ts"], repoRoot);
// hand `files` to the headless script as its working set
```

Conflict prediction ([[DR-0012]]) and guideline resolution ([[DR-0014]]) stay pure. Context
assembly is the case that reaches for disk — so reach for `@osdlc/intersect/fs` only here.
