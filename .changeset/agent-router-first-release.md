---
"@osdlc/agent-router": patch
---

First public release. Picks the coding-agent tool, model and effort to launch: a model catalogue
with a shipped snapshot, a resolver for references (`tool/model[ctx=…]@effort`), and an ordered
profile walk with first-available fallback, category chains across tools and an author rule for
reviews. The main entry is pure and browser-safe. Matches the Rust `agent-router` crate 0.4.0.

**Added**

- A [guide](docs/guide/getting-started.md) from the problem to a chosen launch, with tested examples.
- `isEffortLevel`, `modelProblem` and `MAX_SIZE`.

**Changed**

- **Breaking:** the package is `@osdlc/agent-router`. It was developed under other names and never
  published under them.
- **Breaking:** `ok` and `err` are no longer exported. `Result` is the `@osdlc/result` type,
  re-exported; build results with `@osdlc/result`'s `ok` and `err`.
- **Breaking:** an effort that is not a known level (`claude/max@hgih`, `*/max@hgih`, `pi@off`) is
  a parse error, `unknown-effort`. `checkRef` returns the same code for a reference built in code,
  a wildcard's included, so the profile is `invalid`. A typo'd effort on a wildcard used to reach
  the first tool that declares no effort levels, unchecked. An effort the catalogue cannot check
  is now listed in `chosen.warnings`.
- **Breaking:** the catalogue names efforts on `EFFORT_LEVELS` only. pi's lowest is `none` (was
  pi's own `off`); `@osdlc/agent-call` passes it to pi as `--thinking off`. Write `pi@none`. A
  config or machine catalogue layer with another word fails the schema, and `modelsDevRow` drops
  one, so no layer can list an effort a reference cannot name.
- **Breaking:** a model a tool could read as a flag or misread is a parse error, `invalid-model`:
  one that starts with `-` (or has a `/`-separated part that does, `pi/ollama/-x`), or holds
  whitespace, a control character or an invisible formatting character. `PinsSchema` refuses such
  a pin. Other punctuation (`qwen3:4b`) still parses.
- **Breaking:** `parseRef` takes `unknown` and returns a `not-a-string` error for anything else,
  instead of throwing.
- **Breaking:** a context size above `MAX_SIZE` tokens (`[ctx=99999999999999999999999m]`) is
  refused: `invalid-qualifiers` in a reference, `invalid-context` in a profile. It could not be
  printed back.
- **Breaking:** config records (profiles, pins, catalogue tools, providers, models, aliases,
  classify families) refuse a `__proto__` key. It used to be dropped silently.
- **Breaking:** the shipped snapshot and the built-in tables (`SNAPSHOT_LAYER`, `BUILTIN_CATALOGUE`,
  `BUILTIN_QUERY`, `BUILTIN_PROFILES`, `BUILTIN_CLASSIFY_RULES`, `DEFAULT_CHAIN_ORDER`, `TIERS`,
  `TRAITS`, `AVAILABILITY_REASONS`, `PROFILE_SKIP_REASONS`, `ROUTING_KEYS`, `HEADLESS_SLOTS`) are
  deep-frozen, `effortsFor` returns a copy, and a query freezes its `chainOrder` and `pins`. One
  caller could change them for every other.
- The `./config` subpath and the detection report schemas are experimental. The README lists
  them.
- Requires Node.js 22 or later.

**Fixed**

- Under the `wait` and `person` author rules, a non-author entry skipped only for a cooldown is
  taken, flagged `allCooling`, as the README says. It used to give `wait` or `person`.
- `contextArgs('claude', model, size)` above Claude's one `[1m]` variant is
  `contextUnchecked: true`. It used to return `opus[1m]`, less context than asked.
- `resolveBinding` returns a `binding-invalid` error for a binding that is not an object or a
  `tool` that is not a string, instead of throwing a `TypeError`.
- `viaArgs` of a blank `via` is `[]`, not `['']`, and the catalogue schemas refuse a blank `via`.
- The `profiles` section's description says what the section checks and what the host checks. It
  claimed an unknown tool or a bad effort fails the load.
