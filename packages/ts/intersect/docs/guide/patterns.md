---
title: Patterns
sidebar:
  order: 2
description: The glob dialect, the exact-match-vs-subtree rule, and the matching options.
---

Intersect reasons over patterns as languages, not over the filesystem. `parse` splits a
path-like string on `/` and takes each segment as a glob token, verbatim. There is no
inference — no directory/file heuristic, no ambiguity error. A single trailing separator is
normalized off, so `src/api/` equals `src/api`; nothing else is collapsed.

## The rule: exact match vs. subtree

A pattern with **no wildcards is an exact-path match**. A bare path is exactly that path,
not the files beneath it. You opt into a subtree explicitly with `/**`.

```ts
import { intersects } from "@osdlc/intersect";

// No wildcards → an exact-path match. Opt into a subtree explicitly with `**`.
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

## The dialect

Each segment between separators is a glob token. `/` is a distinguished symbol that the
per-segment wildcards never cross.

| Token | Matches |
|---|---|
| `*` | any run of characters within one segment (`[^/]*`) |
| `?` | exactly one character within a segment |
| `**` | zero or more whole segments — the only token that crosses `/` |
| `{a,b}` | alternation: `a` or `b` (e.g. `*.{vue,html,jsx}`) |
| `[abc]`, `[a-z]` | one character from the class |
| `[!abc]` | one character NOT in the class |
| literal text | itself, verbatim |

## Options

Matching semantics are shared by the segment core and the path API. All default off except
`globstarMatchesZero`.

| Option | Default | Effect |
|---|---|---|
| `caseInsensitive` | `false` | Match paths ignoring ASCII case. |
| `dot` | `false` | Let `*`/`**` match a leading-dot segment. Off, so dotfiles are excluded. |
| `globstarMatchesZero` | `true` | Let a globstar span zero segments, so `a/**/b` matches `a/b`. |

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
| `*` | `.env` | `{ dot: true }` | `true` | dot opt-in |
| `a/**/b` | `a/b` | `{ globstarMatchesZero: true }` | `true` | globstar spans zero segments |

Pattern-level negation (`!pat`, gitignore re-includes) is out of v1 — it needs language
complement. Class-negation `[!abc]` is fine, since it is per-character, not per-pattern.
