# @osdlc/agent-router

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
