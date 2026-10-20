---
title: Intersect
description: Path-pattern overlap engine — do two globs share a common matching path?
---

Intersect is a path-pattern overlap engine. It answers one question: do two globs
share a common matching path? It reasons over patterns as languages — pure pattern
algebra — and never touches the filesystem, except through the opt-in
`@osdlc/intersect/fs` layer. The pairwise question (`A` vs. `B`) is polynomial, so the API
stays pairwise and one-vs-set.

## The rule: exact match vs. subtree

A pattern with **no wildcards is an exact-path match**. There is no directory/file
inference and no ambiguity error: a bare path is exactly that path, and you opt into
a subtree with `/**`.

```ts
import { intersects } from "@osdlc/intersect";

// No wildcards → an exact-path match. Opt into a subtree explicitly with `**`.
intersects("src/siteA/components", "src/siteA/components");
intersects("src/siteA/components", "src/siteA/components/Button.vue");
intersects("src/siteA/components/**", "src/siteA/components/Button.vue");
```

| A | B | Result | Why |
|---|---|---|---|
| `src/siteA/components` | `src/siteA/components` | `true` | same path |
| `src/siteA/components` | `src/siteA/components/Button.vue` | `false` | a child, not the path |
| `src/siteA/components/**` | `src/siteA/components/Button.vue` | `true` | explicit `**` subtree |

## Entry points

Three subpaths, layered so dependencies point down. The core, the segments engine,
and the path API pull **zero** runtime dependencies; only `@osdlc/intersect/fs` pulls a
globber. The dependency boundary is the entry-point split itself.

| Import | Layer | What it is | Runtime deps |
|---|---|---|---|
| `@osdlc/intersect/segments` | L0 core | Pure engine over pre-split segment arrays — no strings, no disk. | none |
| `@osdlc/intersect` | L1 path API | Friendly surface: parses glob strings, set-aware primitives, the registry. | none |
| `@osdlc/intersect/fs` | L2 filesystem | Async resolution against a real on-disk tree. | `tinyglobby` |

## The core question

```ts
import { intersects } from "@osdlc/intersect";

intersects("src/**/*.ts", "src/api/handler.ts");
intersects("src/api/**", "src/web/**");
intersects("src/api/**", "src/**/*.ts");
```

| A | B | Result | Why |
|---|---|---|---|
| `src/**/*.ts` | `src/api/handler.ts` | `true` | the file is inside the glob |
| `src/api/**` | `src/web/**` | `false` | disjoint subtrees |
| `src/api/**` | `src/**/*.ts` | `true` | `src/api/x.ts` is common to both |

## API reference

The **API Reference** section in the sidebar is generated directly from the
TypeScript source of the three entry points, so it always matches the shipped
surface. Start with `intersects`, `matches`, `overlapping`, and `witness` on the
path API.
