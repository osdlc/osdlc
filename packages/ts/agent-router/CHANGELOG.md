# @osdlc/agent-router

## 0.4.6

### Patch Changes

- 081918d: The optional `@osdlc/config-layers` peer range now admits the 0.12 line (`^0.8.0 || ^0.9.0 || ^0.10.0 || ^0.11.0 || ^0.12.0`). `./config` builds its sections unchanged on 0.12.

## 0.4.5

### Patch Changes

- 39819c9: The optional `@osdlc/config-layers` peer range now admits the 0.11 line (`^0.8.0 || ^0.9.0 || ^0.10.0 || ^0.11.0`). `./config` builds its sections unchanged on 0.11.
- Updated dependencies [fa8118b]
- Updated dependencies [63b5800]
  - @osdlc/agent-call@0.15.0

## 0.4.4

### Patch Changes

- ad4cc7d: `modelsDevRows` names the field when it refuses a malformed models.dev row. The reason was
  `row is malformed`; it is now `row is malformed: <field>: <issue>`, for example
  `row is malformed: cost.output: Invalid input: expected number, received null`, so a refresh says
  which field to look at. A row that cannot be mapped at all is still `row is malformed`.

## 0.4.3

### Patch Changes

- Updated dependencies [6c329b7]
  - @osdlc/agent-call@0.14.0

## 0.4.2

### Patch Changes

- Updated dependencies [9a1d13c]
  - @osdlc/agent-call@0.13.0

## 0.4.1

### Patch Changes

- 6768e28: First public release. Picks the coding-agent tool, model and effort to launch: a model catalogue
  with a shipped snapshot, a resolver for references (`tool/model[ctx=…]@effort`), and an ordered
  profile walk with first-available fallback, category chains across tools and an author rule for
  reviews. The main entry is pure and browser-safe. Matches the Rust `agent-router` crate 0.4.0.
  
  **Added**
  
  - A [guide](https://github.com/osdlc/osdlc/blob/main/packages/ts/agent-router/docs/guide/getting-started.md) from the problem to a chosen launch, with tested examples.
  - `isEffortLevel`, `modelProblem` and `MAX_SIZE`.
  
  **Changed**
  
  Each change below breaks against 0.4.0 in the history further down. None was published, so no
  published version breaks.
  
  - The package is `@osdlc/agent-router`. It was developed under other names and never
    published under them.
  - `ok` and `err` are no longer exported. `Result` is the `@osdlc/result` type,
    re-exported; build results with `@osdlc/result`'s `ok` and `err`.
  - An effort that is not a known level (`claude/max@hgih`, `*/max@hgih`, `pi@off`) is
    a parse error, `unknown-effort`. `checkRef` returns the same code for a reference built in code,
    a wildcard's included, so the profile is `invalid`. A typo'd effort on a wildcard used to reach
    the first tool that declares no effort levels, unchecked. An effort the catalogue cannot check
    is now listed in `chosen.warnings`.
  - The catalogue names efforts on `EFFORT_LEVELS` only. pi's lowest is `none` (was
    pi's own `off`); `@osdlc/agent-call` passes it to pi as `--thinking off`. Write `pi@none`. A
    config or machine catalogue layer with another word fails the schema, and `modelsDevRow` drops
    one, so no layer can list an effort a reference cannot name.
  - A model a tool could read as a flag or misread is a parse error, `invalid-model`:
    one that starts with `-` (or has a `/`-separated part that does, `pi/ollama/-x`), or holds
    whitespace, a control character or an invisible formatting character. `PinsSchema` refuses such
    a pin. Other punctuation (`qwen3:4b`) still parses.
  - `parseRef` takes `unknown` and returns a `not-a-string` error for anything else,
    instead of throwing.
  - A context size above `MAX_SIZE` tokens (`[ctx=99999999999999999999999m]`) is
    refused: `invalid-qualifiers` in a reference, `invalid-context` in a profile. It could not be
    printed back.
  - Config records (profiles, pins, catalogue tools, providers, models, aliases,
    classify families) refuse a `__proto__` key. It used to be dropped silently.
  - The shipped snapshot and the built-in tables (`SNAPSHOT_LAYER`, `BUILTIN_CATALOGUE`,
    `BUILTIN_QUERY`, `BUILTIN_PROFILES`, `BUILTIN_CLASSIFY_RULES`, `DEFAULT_CHAIN_ORDER`, `TIERS`,
    `TRAITS`, `AVAILABILITY_REASONS`, `PROFILE_SKIP_REASONS`) are
    deep-frozen, `effortsFor` returns a copy, and a query freezes its `chainOrder` and `pins`. One
    caller could change them for every other.
  - The `./config` subpath and the detection report schemas are experimental. The README lists
    them.
  - Requires Node.js 22 or later. zod 4 is a peer, and `@osdlc/config-layers` (0.8, 0.9 or 0.10)
    an optional peer that only the `./config` subpath needs.
  
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

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.4.0] - 2026-10-31 (unpublished)

#### Added

- `layerCatalogue(layers, { strict })` and `Catalogue.warnings`: a removal row for an unknown model
  is a warning, or a problem under `strict`.

#### Changed

- **Breaking:** an offerings row that adds a model the catalogue lacks is a catalogue problem, so a
  config that adds a row for a model before the catalogue knows it fails to load.

#### Fixed

- An offerings row that replaces an existing offering keeps the `native_name`, `efforts` and
  `context` it leaves out, across config layers too.
- `chooseFromProfile` drops only the chosen entry's own skips from `skipped`.
- The author rule's fallback to another model of the tier applies the entry's trait filter, so
  `*/fast[local]` never falls back to a cloud model.

### [0.3.13] - 2026-10-30 (unpublished)

#### Added

- `Binding.profile` may be an inline list of references. A list that does not parse is the new
  `invalid-profile` error.

### [0.3.12] - 2026-10-30 (unpublished)

#### Fixed

- An offerings row without `native_name` on a curated tool takes the tool's own name for the
  model.

### [0.3.11] - 2026-10-28 (unpublished)

#### Added

- Traits `vision` and `image-out`, in `TRAITS`, the reference parser and the catalogue schema.
- The models.dev mapping keeps text models without tool calling (no `agent` trait) and
  image-output models. A wildcard or tier entry that asks for `[image-out]` expands to image
  models; every other entry stays agent-only.

#### Changed

- Ollama's `thinking` capability maps to the `reasoning` trait.

### [0.3.10] - 2026-10-26 (unpublished)

#### Fixed

- Dependency updates (0.3.7 to 0.3.10, 2026-10-22 to 2026-10-26): `@osdlc/agent-call` 0.9 and
  `@osdlc/config-layers` 0.8.

### [0.3.6] - 2026-10-21 (unpublished)

#### Fixed

- Dependency updates (0.3.2, 0.3.3 and 0.3.6): the `./config` subpath takes its config
  primitives from `@osdlc/config-layers`.

### [0.3.5] - 2026-10-19 (unpublished)

#### Added

- An effort the tool and model do not accept moves at most one step on `EFFORT_LEVELS`, up first,
  then down. `Resolved.effortAdjusted` records the move, a profile walk traces it, and
  `adjustEffort` and `effortAdjustedMessage` are exported. Only an effort further away is an
  `unsupported-effort` error.

### [0.3.4] - 2026-10-18 (unpublished)

#### Added

- `routerSection` takes an optional `stability` for the host's `router` key.

### [0.3.1] - 2026-10-16 (unpublished)

#### Added

- The `./config` subpath: `profilesSection`, `routingSection` and `routerSection`, which take the
  host's `consumers` option. It is not browser-safe.

### [0.3.0] - 2026-10-11 (unpublished)

#### Added

- A model catalogue: tools, providers, models and derived offerings, with a shipped snapshot,
  config layers, a models.dev mapping and a query API.
- Classifier rules, category chains and pins, which map tiers to models; `*` wildcards; reference
  qualifiers (`[ctx=…]` and traits); context checks and `contextArgs`; validity checks
  (`checkRef`); routing rules (`parseRouting`, `matchRule`); `launchMode` and `viaArgs`; a wildcard
  `tool` binding; and the detection report schemas.
- Skips carry reason codes (`ProfileSkip.reason`), and a cooldown alone never gives `none`.

#### Changed

- **Breaking:** `resolveRef(ref, ctx)` and `validateProfile(profile, ctx)` resolve against the
  catalogue; the per-tool tables are gone.
- **Breaking:** `Binding` names its reference `tool`, not `model`.
- **Breaking:** the author rule is the caller's: `chooseFromProfile` takes `ctx.authorRule`, and a
  profile no longer has `not_the_author` or `if_only_author_left`.
- **Breaking:** a tool's `binary` is snapshot data, not config. `ModelsConfigSchema` is
  `RouterConfigSchema`.

### [0.2.0] - 2026-10-10 (unpublished)

#### Changed

- **Breaking:** the built-in tools drop `gemini` and add `antigravity`, which accepts `low`,
  `medium` and `high` effort.

### [0.1.1] - 2026-10-05 (unpublished)

#### Fixed

- Tier tables come from `@osdlc/agent-call`'s Node-free `./models` entry.

### [0.1.0] - 2026-10-05 (unpublished)

#### Added

- Reference parsing, profile parsing and ordered selection with an author rule, per-tool tables
  and a `Result` type. Availability and the author are passed in; nothing is spawned, read or
  fetched.
