---
title: Getting started
sidebar:
  order: 1
description: The three entry points, their dependencies, and a first intersects call.
---

Intersect has three entry points. Each builds on the one below it. Use the one that fits
the question you have.

| Import | Use it when | Runtime deps |
|---|---|---|
| `@osdlc/intersect` | You have glob strings, one or an array. | none |
| `@osdlc/intersect/segments` | You already have patterns split into segment arrays. | none |
| `@osdlc/intersect/fs` | You need the files on disk that fall in a scope. | `tinyglobby` |

The path API and the segment core have no runtime dependencies. Only `@osdlc/intersect/fs`
reads the disk, and only it loads `tinyglobby`. Import it only when you need real files.

## A first call

```ts
import { intersects } from "@osdlc/intersect";

intersects("src/**/*.ts", "src/api/handler.ts");
intersects("src/api/**", "src/web/**");
```

| A | B | Result | Why |
|---|---|---|---|
| `src/**/*.ts` | `src/api/handler.ts` | `true` | the file is inside the glob |
| `src/api/**` | `src/web/**` | `false` | disjoint subtrees |

Every other function in the package builds on `intersects`.

## One string or an array, on either side

An array matches the union of its patterns. A single string is a set of one. Each function
takes either form, for either argument.

```ts
import { intersects } from "@osdlc/intersect";

intersects(["src/api/**", "src/db/**"], "src/db/pool.ts");
intersects(["src/api/**"], ["docs/**", "src/**/*.md"]);
intersects(["a/**"], ["b/**", "c/**"]);
```

| A | B | Result | Why |
|---|---|---|---|
| `["src/api/**", "src/db/**"]` | `"src/db/pool.ts"` | `true` | matches the 2nd of the set |
| `["src/api/**"]` | `["docs/**", "src/**/*.md"]` | `true` | `src/api/x.md` is common |
| `["a/**"]` | `["b/**", "c/**"]` | `false` | no shared path anywhere |

Comparing two patterns takes polynomial time. So the API only compares two patterns, or one
pattern against each member of a set. It never asks whether many patterns all overlap at
once, which is much more expensive. Next: the [pattern syntax](./patterns.md) and the
[functions](./overlap-matches-witness.md).
