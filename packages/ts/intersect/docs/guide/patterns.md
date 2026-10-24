---
title: Patterns
sidebar:
  order: 2
description: The glob syntax, the exact path versus subtree rule, and the matching options.
---

Intersect compares patterns, not files on disk. `parse` splits a string on `/` and keeps
each segment as written. It does not guess whether a segment is a directory or a file. One
trailing separator is dropped, so `src/api/` equals `src/api`. Nothing else is collapsed.

## The rule: exact path or subtree

A pattern with no wildcards matches only that exact path, not the files beneath it. To
match a subtree, add `/**`.

```ts
import { intersects } from "@osdlc/intersect";

// No wildcards: an exact path. A subtree needs `**`.
intersects("src/siteA/components", "src/siteA/components");
intersects("src/siteA/components", "src/siteA/components/Button.vue");
intersects("src/siteA/components/**", "src/siteA/components/Button.vue");
intersects("**/*.vue", "src/siteA/components/Button.vue");
```

| A | B | Result | Why |
|---|---|---|---|
| `src/siteA/components` | `src/siteA/components` | `true` | same path |
| `src/siteA/components` | `src/siteA/components/Button.vue` | `false` | a child, not the path |
| `src/siteA/components/**` | `src/siteA/components/Button.vue` | `true` | explicit `**` subtree |
| `**/*.vue` | `src/siteA/components/Button.vue` | `true` | wildcards work as usual |

## The syntax

Each segment between separators is a glob. The wildcards inside a segment never match `/`.

| Token | Matches |
|---|---|
| `*` | any run of characters within one segment (`[^/]*`) |
| `?` | exactly one character within a segment |
| `**` | zero or more whole segments — the only token that crosses `/` |
| `{a,b}` | alternation: `a` or `b` (e.g. `*.{vue,html,jsx}`) |
| `[abc]`, `[a-z]` | one character from the class |
| `[!abc]` | one character not in the class |
| literal text | itself |

## Options

The segment core and the path API take the same options. All are off by default except
`globstarMatchesZero`.

| Option | Default | Effect |
|---|---|---|
| `caseInsensitive` | `false` | Match paths ignoring ASCII case. |
| `dot` | `false` | Let `*`, `?` and `**` match a segment that starts with `.`. Off, so dotfiles are excluded. |
| `globstarMatchesZero` | `true` | Let `**` match zero segments, so `a/**/b` matches `a/b`. |

```ts
import { intersects } from "@osdlc/intersect";

intersects("SRC/**", "src/api.ts", { caseInsensitive: true });
intersects("*", ".env");
intersects("*", ".env", { dot: true });
intersects("a/**/b", "a/b", { globstarMatchesZero: true });
```

| A | B | Options | Result | Why |
|---|---|---|---|---|
| `SRC/**` | `src/api.ts` | `{ caseInsensitive: true }` | `true` | ASCII case ignored |
| `*` | `.env` | — | `false` | dotfiles excluded by default |
| `*` | `.env` | `{ dot: true }` | `true` | dotfiles allowed |
| `a/**/b` | `a/b` | `{ globstarMatchesZero: true }` | `true` | `**` matches zero segments |

Negating a whole pattern (`!pat`, or gitignore re-includes) is not supported. It would need
the complement of a pattern's set of paths, which pairwise comparison cannot give. Negating a
class, `[!abc]`, works, since it applies to one character, not the whole pattern.
