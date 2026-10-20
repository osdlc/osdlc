---
title: Getting started
description: The three entry points, their dependency posture, and a first intersects call.
---

Intersect ships three import subpaths, layered so dependencies point down. Reach for the
one that matches the question you have.

| Import | Reach for it when | Runtime deps |
|---|---|---|
| `@osdlc/intersect` | You hold glob strings and want the friendly, set-aware surface. | none |
| `@osdlc/intersect/segments` | You already have pre-split segment arrays and want the pure core. | none |
| `@osdlc/intersect/fs` | You need the concrete files on disk that fall in a scope. | `tinyglobby` |

The dependency boundary is the entry-point split itself. The path API and the segment core
pull **zero** runtime dependencies; only `@osdlc/intersect/fs` — the sole layer that reads disk —
pulls a globber. Import it only when you need real files.

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

`intersects` is the load-bearing primitive. Every other question in the library is a shape
over it.

## One string or a set — on either side

An array is the union of its patterns; a single string is a one-element set. The same
primitives take whichever shape you already hold, on either argument.

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

The pairwise question (`A` vs. `B`) is polynomial, so the API stays pairwise and
one-vs-set — it never asks the intractable many-pattern question. Next: the [pattern
dialect](/guide/patterns) and the [primitives](/guide/overlap-matches-witness).
