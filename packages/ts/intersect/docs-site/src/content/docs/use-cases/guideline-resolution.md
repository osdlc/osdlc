---
title: Guideline resolution
description: The registry — which labeled pattern-sets apply to a scope, in registration order.
---

Guideline, standard, and policy files each declare the path patterns they govern — a general
UI guideline for `**/*.{vue,html,jsx}`, a Vue-specific one for `**/*.vue`, an API guideline
for `src/api/**`. Before an agent acts, it needs the subset of those artifacts that apply to
where it is about to work ([[DR-0014]]). The applicable set is computed from patterns alone,
so the target files need not exist yet.

`index` builds a reverse index over *labeled* pattern-sets. It is pure — no filesystem — and
compiles each entry once, up front.

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
| `applicableTo("src/siteA/components/**")` | `["guidelines/UI", "guidelines/UI/vue"]` | the api guideline doesn't overlap |
| `matching("src/siteA/components/Button.vue")` | `["guidelines/UI", "guidelines/UI/vue"]` | both UI sets match the file |

| Query | Scope | Returns |
|---|---|---|
| `applicableTo(scope)` | a pattern-set (a subtree is `dir/**`) | ids whose set OVERLAPS the scope |
| `matching(path)` | a concrete path | ids whose set matches that path |

Both return ids in **registration order**.

## Registration order is a prioritization

`index` keeps the order entries were supplied and both queries return matches in it. Register
general-to-specific and read the result as a prioritization — first is most general, last is
most specific. Intersect returns the order; the caller picks the precedence rule.

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

A guideline "appears twice" only if the caller registers the same `id` twice. `index`
rejects that at construction rather than silently keeping first or last.

```ts
import { index } from "@osdlc/intersect";

index([
  { id: "guidelines/UI", patterns: ["**/*.vue"] },
  { id: "guidelines/UI", patterns: ["**/*.html"] }, // same id, registered twice
]);
```

Throws `Error: duplicate registry id 'guidelines/UI'`.

## SDLC tie-in

An SDLC `standard` entity already carries `applies_to.paths`, so it is a ready-made labeled
pattern-set. Feed each standard in, ordered broad → specific, then ask which apply.

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

`applies` is e.g. `["S-0006-skill-md-is-direct-instruction", "S-0012-vue-components"]`,
in priority order; `context` is their bodies, ready to hand to the agent action.
