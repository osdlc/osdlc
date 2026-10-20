---
title: Conflict detection
description: Predict edit conflicts between two work items from their path claims — pure, no disk.
---

Two work items that touch the same files collide at merge. If each item declares the paths
it is likely to touch — as globs, not a fixed file list — then two items *probably* conflict
when their claimed pattern-sets overlap. That is a pattern-vs-pattern question, distinct from
the after-the-fact "do these concrete changed files hit a reserved pattern?" a git hook asks
([[DR-0012]]).

Knowing two ready items overlap *before* dispatch lets a scheduler serialize them or warn,
rather than discovering the collision at merge. This is pure L0 pattern algebra: no
filesystem, and the claimed paths need not exist yet.

## overlapping predicts, witness explains

`overlapping` returns the claim(s) that collide; `witness` turns that into a concrete path
you can name in the warning.

```ts
import { overlapping, witness } from "@osdlc/intersect";

const taskA = ["src/api/**", "src/db/schema.ts"];
const taskB = ["src/api/routes/*.ts", "docs/**"];

overlapping(taskA, taskB);
overlapping(["docs/**"], taskA);
```

| Call | Returns | Why |
|---|---|---|
| `overlapping(taskA, taskB)` | `["src/api/**"]` | the overlapping claim → predicted conflict |
| `overlapping(["docs/**"], taskA)` | `[]` | no overlap |

## End to end

```ts
import { overlapping, witness } from "@osdlc/intersect";

interface WorkItem { id: string; claims: string[]; } // globs the item is likely to touch

function conflict(a: WorkItem, b: WorkItem): { overlaps: string[]; example: string | null } {
  const overlaps = overlapping(a.claims, b.claims);
  return { overlaps, example: overlaps.length ? witness(a.claims, b.claims) : null };
}

conflict(
  { id: "T-1", claims: ["src/api/**", "src/db/schema.ts"] },
  { id: "T-2", claims: ["src/api/routes/*.ts", "docs/**"] },
);
```

That call returns `{ overlaps: ["src/api/**"], example: "src/api/routes/list.ts" }` — the
scheduler serializes T-1 and T-2, or warns, before dispatch. Pure L0, no disk.

Because it never reads disk, this runs at scheduling time on claims alone. It complements a
lease system, which prevents collisions on the *same* task but says nothing about two
different tasks whose scopes intersect.
