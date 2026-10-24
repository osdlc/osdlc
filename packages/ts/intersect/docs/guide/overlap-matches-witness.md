---
title: Overlap, matches, witness
sidebar:
  order: 3
description: The path API functions intersects, matches, whichMatch, overlapping, witness and compile.
---

The path API is a small set of functions. All of them answer the same question about two
patterns. Each parses its `Patterns` argument (a string or an array) into segment patterns,
then calls the segment core.

| Function | Compares | Returns |
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

## overlapping: check which side is filtered

`overlapping` has two forms that filter opposite sides. The free function returns a subset of
its first argument, `query`, in query order. A compiled `Matcher.overlapping` returns a subset
of its own argument, `candidates`.

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

## witness: show where two sets overlap

A witness is a concrete path both sets match, or `null` when they are disjoint. It costs
nothing extra: it is the path the search already found to show the overlap. It lets you say
where two sets overlap, not only that they do.

```ts
import { witness } from "@osdlc/intersect";

witness("src/api/**", "src/**/handler.ts");
witness("src/api/**", "src/web/**");
```

| A | B | Witness | Why |
|---|---|---|---|
| `src/api/**` | `src/**/handler.ts` | `"src/api/handler.ts"` | a concrete path both match |
| `src/api/**` | `src/web/**` | `null` | no common path |
| `*/*` | `*/{,.a}` | `null` | no string can write the only common path |

The last row is the one exception. A witness is always a path that matches both sides. When the
first common path ends in an empty segment, no string can write it, because `parse` drops a
trailing separator. So the search goes on to a longer path: `witness("a//**", "**")` is `"a//a"`.
The witness is `null` only when no common path can be written as a string. In `*/{,.a}` against
`*/*`, `*` does not match `.a`, so the empty branch is the only shared second segment, and it comes
last. `intersects` works on segment arrays rather than strings, so it still returns `true` for such
a pair.

## compile: reuse one scope

For a scope tested against many paths or patterns, `compile` parses each pattern once. Every
method reuses the parsed set.

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
| `scope.witness("src/**/*.ts")` | `"src/api/a.ts"` |
