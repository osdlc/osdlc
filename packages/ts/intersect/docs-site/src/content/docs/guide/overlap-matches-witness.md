---
title: Overlap, matches, witness
description: The path-API primitives — intersects, matches, whichMatch, overlapping, witness, compile.
---

The path API is a small set of primitives, all shapes over the same pairwise question. Each
coerces its `Patterns` argument (a string or a set) to segment-patterns, then defers to the
core.

| Primitive | Shape | Returns |
|---|---|---|
| `intersects(a, b)` | set ↔ set | `true` if some path matches both. |
| `matches(path, patterns)` | path ↔ set | `true` if the path matches any pattern. |
| `whichMatch(path, patterns)` | path ↔ set | The patterns that match the path, in input order. |
| `overlapping(query, candidates)` | set ↔ set | The `query` subset that overlaps a candidate. |
| `witness(a, b)` | set ↔ set | A concrete common path, or `null`. |
| `compile(patterns)` | — | A reusable `Matcher` for a fixed scope. |

## intersects and matches

```ts
import { intersects, matches } from "@osdlc/intersect";

intersects("src/api/**", "src/**/*.ts");
matches("src/api/user.ts", ["src/api/**", "**/*.test.ts"]);
matches("README.md", ["src/api/**", "**/*.test.ts"]);
```

| Call | Result | Why |
|---|---|---|
| `intersects("src/api/**", "src/**/*.ts")` | `true` | `src/api/x.ts` is common to both |
| `matches("src/api/user.ts", […])` | `true` | matches the first pattern |
| `matches("README.md", […])` | `false` | matches neither pattern |

## whichMatch

```ts
import { whichMatch } from "@osdlc/intersect";

whichMatch("src/api/user.ts", ["src/api/**", "src/**", "docs/**"]);
```

| Path | Patterns | Returns | Why |
|---|---|---|---|
| `src/api/user.ts` | `["src/api/**", "src/**", "docs/**"]` | `["src/api/**", "src/**"]` | `docs/**` does not match |

## overlapping — mind which side is filtered

`overlapping` has two forms that filter **opposite** sides. The free function returns a
subset of its first argument, `query`, in query order. A compiled `Matcher.overlapping`
returns a subset of ITS argument, `candidates`.

```ts
import { overlapping, compile } from "@osdlc/intersect";

const taskA = ["src/api/**", "src/db/schema.ts"];
const taskB = ["src/api/routes/*.ts", "docs/**"];

overlapping(taskA, taskB);
compile(taskA).overlapping(taskB);
```

| Call | Returns | Which side is filtered |
|---|---|---|
| `overlapping(taskA, taskB)` | `["src/api/**"]` | the `query` (first arg) subset |
| `compile(taskA).overlapping(taskB)` | `["src/api/routes/*.ts"]` | the `candidates` (argument) subset |

## witness — make an overlap explainable

A witness is a concrete path both sets match, or `null` when they are disjoint. It is free:
the reachability path the engine already walked to prove the overlap. It turns "these
overlap" into "these overlap *at* `X`".

```ts
import { witness } from "@osdlc/intersect";

witness("src/api/**", "src/**/handler.ts");
witness("src/api/**", "src/web/**");
```

| A | B | Witness | Why |
|---|---|---|---|
| `src/api/**` | `src/**/handler.ts` | `"src/api/handler.ts"` | a concrete path both match |
| `src/api/**` | `src/web/**` | `null` | no common path |
| `*/*` | `*/{,.a}` | `null` | the only common path has no spelling |

The last row is the one edge: the witness is always a path that really matches both sides, so a
common path that no *string* can spell is reported as `null`. That takes a segment the two sides
share only when it is EMPTY (`*` will not match `.a`, so `{,.a}` is left with its empty branch),
landing at the end of the path — and `parse` normalizes a trailing separator back off, so `"a/"`
would come back as `["a"]` and match neither side. `intersects`, which answers over segment vectors
rather than strings, still reports `true` for such a pair.

## compile — amortize a fixed scope

For a scope tested against many paths or patterns, `compile` parses each pattern once; every
method reuses that parsed set.

```ts
import { compile } from "@osdlc/intersect";

const scope = compile(["src/api/**", "src/db/**"]);

scope.matches("src/api/user.ts");
scope.matches("test/api/user.test.ts");
scope.overlapping(["docs/**", "src/db/pool.ts"]);
scope.witness("src/**/*.ts");
```

| Call | Returns |
|---|---|
| `scope.matches("src/api/user.ts")` | `true` |
| `scope.matches("test/api/user.test.ts")` | `false` |
| `scope.overlapping(["docs/**", "src/db/pool.ts"])` | `["src/db/pool.ts"]` |
| `scope.witness("src/**/*.ts")` | e.g. `"src/api/user.ts"` |
