---
title: Guideline resolution
description: The registry, which answers which labeled sets of patterns apply to a scope, in the order they were added.
---

Guideline, standard and policy files each declare the path patterns they cover: a general UI
guideline for `**/*.{vue,html,jsx}`, a Vue guideline for `**/*.vue`, an API guideline for
`src/api/**`. Before an agent acts, it needs the ones that apply to where it is about to work
([[DR-0014]]). The answer comes from the patterns alone, so the target files need not exist
yet.

`index` builds an index of labeled sets of patterns. It does not read the disk, and it compiles
each entry once, up front.

## index, applicableTo, matching

```ts
import { index } from "@osdlc/intersect";

const guidelines = index([
  { id: "guidelines/UI",     patterns: ["**/*.{vue,html,jsx}"] },
  { id: "guidelines/UI/vue", patterns: ["**/*.vue"] },
  { id: "guidelines/api",    patterns: ["src/api/**"] },
]);

// A subtree query (no files need exist), then a concrete-file query:
guidelines.applicableTo("src/siteA/components/**");
guidelines.matching("src/siteA/components/Button.vue");
```

| Call | Returns | Why |
|---|---|---|
| `applicableTo("src/siteA/components/**")` | `["guidelines/UI", "guidelines/UI/vue"]` | the api guideline does not overlap |
| `matching("src/siteA/components/Button.vue")` | `["guidelines/UI", "guidelines/UI/vue"]` | both UI sets match the file |

| Query | Scope | Returns |
|---|---|---|
| `applicableTo(scope)` | patterns (a subtree is `dir/**`) | ids whose patterns overlap the scope |
| `matching(path)` | a concrete path | ids whose patterns match that path |

Both return ids in the order the entries were added.

## The order of entries is a priority order

`index` keeps the order the entries were given in, and both queries return matches in that
order. Add entries from general to specific, and read the result as a priority list: first is
most general, last is most specific. Intersect returns the order. The caller picks the
precedence rule.

```ts
import { index } from "@osdlc/intersect";

// Registration order IS the priority: general first, specific last.
const guidelines = index([
  { id: "guidelines/UI",     patterns: ["**/*.{vue,html,jsx}"] },
  { id: "guidelines/UI/vue", patterns: ["**/*.vue"] },
]);

// applicable is ["guidelines/UI", "guidelines/UI/vue"], in registration order.
const applicable   = guidelines.applicableTo("src/siteA/components/**");
const inOrder      = applicable;        // apply general → specific
const mostSpecific = applicable.at(-1); // "guidelines/UI/vue"
```

## Duplicate ids throw

A guideline appears twice only if the caller adds the same `id` twice. `index` throws when that
happens, rather than keeping the first or the last without a word.

```ts
import { index } from "@osdlc/intersect";

index([
  { id: "guidelines/UI", patterns: ["**/*.vue"] },
  { id: "guidelines/UI", patterns: ["**/*.html"] }, // same id, registered twice
]);
```

Throws an `IntersectError` with code `DUPLICATE_REGISTRY_ID` (message `duplicate registry id 'guidelines/UI'`).

## SDLC tie-in

An SDLC `standard` entity already carries `applies_to.paths`, so it is a labeled set of
patterns as it stands. Add each standard, from broad to specific, then ask which apply.

```ts
import { index } from "@osdlc/intersect";
import { loadStandards, readBody } from "./sdlc";

const standards = index(
  loadStandards().map((s) => ({ id: s.id, patterns: s.applies_to.paths })),
);

// About to work under a directory — which standards apply, in priority order?
const applies = standards.applicableTo("src/siteA/components/**");

// Assemble their guidance as the agent action's context:
const context = applies.map(readBody);
```

`applies` is, for example, `["S-0006-skill-md-is-direct-instruction", "S-0012-vue-components"]`,
in priority order. `context` is their bodies, ready to give to the agent action.
