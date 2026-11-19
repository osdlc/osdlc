---
id: D-06
type: decision
state: accepted
created: 2026-11-07
---

# D-06: A model catalogue, a mapping table and a resolver

First decided on 2026-10-09, while the package was developed elsewhere. This note restates it for
the package's own planning folder.

## Decision

The router has three parts.

| Part | Holds | Changes when | Written by |
| --- | --- | --- | --- |
| Model catalogue | Facts: which [tools](../terms/TM-02-tool.md) serve which [providers](../terms/TM-03-provider.md), what each model supports, and the offerings that join them | A model ships, a tool updates, a runtime pulls a model | The shipped snapshot, a host's refresh, config layers |
| Mapping table | Policy: which model each [tier](../terms/TM-06-tier.md) means, and the order to try candidates | A refresh reclassifies, or someone pins or overrides | Classifier rules (derived), config (by hand) |
| Resolver | No state | Code changes only | This package |

- The catalogue is layered JSON with a typed query API: the shipped snapshot lowest, then
  machine layers, then config. Offerings are derived (a tool's providers times their models), not
  kept by hand.
- Tiers are derived: classifier rules place each model in `fast`, `standard` or `max`, category
  chains order a tier's models across tools, and pins hold a tier on a tool to one model.
- A [reference](../terms/TM-04-reference.md) is `tool/model[qualifiers]@effort`. Context is a
  qualifier, `[ctx=1m]`, meaning "at least". Brackets, not `?` or `:`, because local model tags
  contain `:` and `?` needs shell quoting.
- Every reference is checked against the catalogue. A combination that is wrong everywhere
  (`codex/sonnet`) is an error that names the nearest valid reference. A model the catalogue does
  not know yet is a warning, and `strict` makes it an error.
- A [profile](../terms/TM-05-profile.md) walk takes the first entry the caller's availability
  check accepts. A cooldown alone is a reason to prefer another entry, never to stop.
- An author rule lets a reviewer run on a different tool from the one that wrote the change. The
  caller passes it.
- Everything environmental arrives as an argument, so the main entry stays pure and
  browser-safe.

## Why

- Facts and policy change at different rates. Models ship monthly; what counts as your `max`
  changes when you decide. One table for both would let a release change behaviour silently.
- Derived offerings scale with tools plus models, not tools times models.
- Data instead of constants: a new model in a known family follows on refresh with no code
  change, and a new family is one classifier rule.
- Skip versus error follows where the fault lies. A config that is wrong everywhere fails at load.
  A choice that cannot run on this machine today falls through to the next entry.

## Options considered

| Option | Against | Pick |
| --- | --- | --- |
| Layered JSON with a query API | No history of its own | Yes |
| SQLite | A native or WebAssembly dependency in a browser-safe package; a snapshot that is not reviewable as a diff | Not below thousands of rows |
| Context as a query string (`?ctx=1m`) or suffix (`:ctx=1m`) | Shell escaping; Ollama tags use `:` | No |
| Profiles only, no derived chains | No automatic fallback; every new model is a config edit | No |
| Adopt a gateway such as LiteLLM or OpenRouter | They route API calls; this launches agent sessions | No |
| A learned router (RouteLLM, Not Diamond) | Per prompt, networked, not reproducible | No |

## Prior art

Surveyed on 2026-10-08 and again on 2026-11-07. The catalogue follows models.dev's model rows and
takes its snapshot from the models.dev API. Ordered fallbacks follow LiteLLM's and OpenRouter's
fallback lists, with one difference: those react to a failed API call, while this checks
availability before launch. The `provider/model` naming matches pi, opencode and OpenRouter. No
surveyed tool enforces an author-differs reviewer rule.

## Consequences

- The shipped snapshot needs a release step: regenerate it from models.dev, review the diff, and
  commit.
- A host owns the refresh, the machine catalogue file and the availability check, and passes them
  in.
