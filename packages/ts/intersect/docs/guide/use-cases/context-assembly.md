---
title: Context assembly
description: Build a headless run's working set from a real tree with intersect/fs, the entry that reads the disk.
---

A headless script, such as an agent run, a batch job or a CI step, works best when it starts
from the right part of the repository. That part is usually written as patterns: "everything
under `src/api/**` and the matching tests." The caller wants the concrete paths in that scope,
to give the model as context ([[DR-0011]]).

This is the one job that needs the filesystem. `@osdlc/intersect/fs` is the only entry that
reads the disk, and the only one that loads `tinyglobby`. It lists the real tree, then filters
every entry through the path API. So the syntax is the same as in the other entries: a bare
path is an exact match, a subtree needs `**`, and `tinyglobby`'s own glob rules never affect
the result.

## filesInScope: the files in a scope

`filesInScope` returns the files on disk that match a scope, sorted by code point and
relative to `cwd` (absolute with `{ absolute: true }`). Symbolic links are skipped. A missing `cwd` or an unreadable
directory throws an `IntersectError` with code `IO_ERROR`.

```ts
import { filesInScope } from "@osdlc/intersect/fs";

const context = await filesInScope(["src/api/**", "src/db/**"], { cwd: repoRoot });
```

`context` — e.g. `["src/api/routes/list.ts", "src/api/user.ts", "src/db/pool.ts", ...]`.

A scope is a set of globs, not of file names. The listed names are compared literally, so a
file named `pages/[id].vue` is that name and not a character class. To match it, escape the
pattern: `pages/\[id\].vue`. A literal repo path passed as a scope misses any file whose name
contains `*?[]{}`.

## resolveIntersection: files in both scopes

```ts
import { resolveIntersection } from "@osdlc/intersect/fs";

const both = await resolveIntersection(["src/**/*.ts"], ["src/api/**"], { cwd: repoRoot });
```

`both` — e.g. `["src/api/routes/list.ts", "src/api/user.ts", ...]` (no `*.md`, no non-api dirs).

## End to end: assemble a run's working set

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

Conflict prediction ([[DR-0012]]) and guideline resolution ([[DR-0014]]) need only patterns.
Context assembly is the case that reads the disk, so use `@osdlc/intersect/fs` only here.
