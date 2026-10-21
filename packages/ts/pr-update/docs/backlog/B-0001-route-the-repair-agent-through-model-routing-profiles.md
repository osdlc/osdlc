---
type: backlog
schema_version: '3'
id: B-0001
tags:
  - pr-update
  - repair
  - agent
  - model-routing
last_reviewed: '2026-10-20'
---
# Route the repair agent through model-routing profiles

`repair.agent` picks one fixed agent, and `repair.model` optionally picks one
fixed model. Let it name a routing reference or profile instead, so the
agent, model and effort are chosen per repair. Examples are
`claude/sonnet@low` and an ordered profile such as
`[claude/sonnet@low, codex/gpt-5@medium]`.

What routing adds:

- **Fallback.** When the first agent's CLI is not installed or not signed
  in, the next one in the profile runs.
- **Sizing.** A cheap model for a one-file regenerate miss, a stronger one
  for a multi-file conflict or a failed verify. The route can key on the
  repair kind and the number of paths.
- **Author rule.** A repair is never routed to the same agent that wrote the
  PR, when the PR's author agent is known.

Candidate building block: a model-routing library that is not yet published.
It resolves `tool/model[ctx=…]@effort` references and profiles against a model
catalogue, needs an availability callback, and imports only agent-call's
`./models` subpath, so it composes with the agent-call presets from D-0001. It
also exports `profiles`/`routing` config sections a host can mount next to
`pr_update`.

Before this can be built:

- The tool router publishes under osdlc.
- Undecided (owner, 2026-10-20): where routing config lives. pr-update
  could mount the router's config sections itself, or take a resolved
  route from its host through a port, or the binary could do one while
  library hosts do the other. Whatever is chosen must keep the engine
  host-neutral (D-0001).
