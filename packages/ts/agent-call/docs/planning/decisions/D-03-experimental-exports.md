---
id: D-03
type: decision
state: accepted
created: 2026-10-18
---

# D-03: Experimental exports

## Decision

These eight exports are marked `@experimental` and listed as such in the
README:

- `modelArgs`, `modelArgsRefusal` and `ModelChoice`
- `templateAdapter`, `templateRefusal` and `TemplateAdapterOptions`
- `claudePluginArgv` and `claudeResumeFlag`

All other exports are stable within 0.x.

## Why

- They build launch arguments for callers that assemble a command line
  themselves. They were written for one caller's session launches. They work
  and are tested, but their shape is not settled.
- The other options were to call them stable, which would fix the shape too
  early, or to move them to another package, which would break the one caller
  that uses all of them.

## Consequences

- A minor release may change or remove any of the eight. The CHANGELOG says
  so under "Breaking" when it happens.
- Their TSDoc does not refer to a particular caller.
