---
title: Conflict detection
description: Predict edit conflicts between two work items from the paths they claim, without reading the disk.
---

Two work items that touch the same files conflict at merge. Say each item declares the paths
it is likely to touch, as globs rather than a fixed file list. Then two items probably conflict
when their claimed patterns overlap. That compares pattern with pattern. A git hook asks a
different question after the fact: do these changed files match a reserved pattern?
([[DR-0012]]).

If a scheduler knows two ready items overlap before it starts them, it can run them one after
the other, or warn, instead of finding the conflict at merge. This needs only the patterns. It
does not read the disk, and the claimed paths need not exist yet.

## overlapping predicts, witness explains

`overlapping` returns the claims that overlap. `witness` gives a concrete path you can name
in the warning.

```ts
import { overlapping, witness } from "@osdlc/intersect";

const taskA = ["src/api/**", "src/db/schema.ts"];
const taskB = ["src/api/routes/*.ts", "docs/**"];

overlapping(taskA, taskB);
overlapping(["docs/**"], taskA);
```

| Call | Returns | Why |
|---|---|---|
| `overlapping(taskA, taskB)` | `["src/api/**"]` | the claim that overlaps: a likely conflict |
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

That call returns `{ overlaps: ["src/api/**"], example: "src/api/routes/a.ts" }`. The
scheduler runs T-1 and T-2 one after the other, or warns, before it starts them.

Because it never reads the disk, this runs at scheduling time on the claims alone. It adds to a
lease system, which stops two runs of the same task from colliding but says nothing about two
different tasks whose scopes overlap.
