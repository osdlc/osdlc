# agent-router

The Rust mirror of the pure core of [`@osdlc/agent-router`](../../ts/agent-router/README.md), so a
Rust host resolves the same references and profiles as a TypeScript one. Internal
(`publish = false`). Why there are two, and how they are kept equal, is decision
[D-05](../../ts/agent-router/docs/planning/decisions/D-05-twin-and-shared-vectors.md).

## What is here

| Module | Mirrors | Holds |
| --- | --- | --- |
| `reference` | `ref.ts` | `parse_ref`, `format_ref`, qualifiers, typed parse errors, the `Tier` and `Trait` enums |
| `catalogue::schema` | `catalogue/schema.ts` | strict `SnapshotLayer` and `MachineCatalogue` (`deny_unknown_fields` plus `validate`) |
| `catalogue::layers`, `offerings`, `query` | `catalogue/*.ts` | layering with per-field provenance and `problems`, derived offerings, `CatalogueQuery` |
| `classify`, `chains` | `classify.ts`, `chains.ts` | classifier rules, category chains, pins (the query's tier mapping needs them) |
| `validity` | `validity.ts` | `check_ref`: `error`, `skip`, `warning`, `ok` |
| `effort` | `effort.ts` | `adjust_effort`: at most one step, up first |
| `context` | `context.ts`, `checkContext` | sizes, `context_args`, `default_window`, `check_context` |
| `resolve` | `resolve.ts` | `resolve_ref`: tier, pin and name to a model, effort moved or unchecked, the check riding along |
| `wildcard` | `wildcard.ts` | `expand_wildcard`: `*/<tier>` as the tier's chain, each candidate resolved |
| `profile` | `profile.ts` | `parse_profile`, `parse_profiles`, `BUILTIN_PROFILES` |
| `choose` | `choose.ts` | `choose_from_profile` with an availability callback, the trace text, skip reasons, `skip_reason_text`, `validate_profile` |
| `binding` | `binding.ts` | `resolve_binding`: a named profile, an inline profile list or one reference |
| `routing` | `routing.ts` | `parse_routing`, `match_rule`, `shadowed_rules`, `format_when` |

Not mirrored: the author rule, the `config` subpath and the models.dev fetch (see below).

## How it stays true to the TypeScript

The TypeScript package emits JSON vectors to `packages/ts/agent-router/fixtures/<area>/<name>.json`:
arrays of `{ name, input, expected }`. Two files sit at the top of `fixtures/`: `constants.json` (a
one-vector array) and `layers.json` (an object of named catalogue layers, not a vector array).
`tests/fixtures.rs` reads the same files and requires the Rust result for every `input` to equal
`expected`. The TypeScript suite runs them too; `pnpm run check:extra` in the TypeScript package
fails when the committed files differ from what the emitter writes.

Change behaviour in the TypeScript first, then regenerate and commit:

```sh
cd packages/ts/agent-router && pnpm run fixtures
cd ../../rust && cargo test -p agent-router
```

Walk vectors script availability: `availability` maps an entry's text (`alpha/standard`, or a
wildcard candidate such as `gamma/fast`) to `{ reason, detail? }`; an entry not listed is
available. The expected output holds the `choice` (trace text exact), the refs the callback was
`asked` in order, and `validateProfile`'s `errors`.

A vector's `layers` name catalogue layers: `"snapshot"` is the shipped
`src/catalogue/snapshot.json`; other names are defined in `fixtures/layers.json`.

## Adding a trait or tier

`Trait` and `Tier` are single enums. A new trait is one variant, its name in `as_str` and its place
in `TRAITS`; then regenerate the fixtures from the TypeScript.

A new tier is a variant of `Tier`, an entry in `TIERS`, a matching variant of `classify::Placement`
(with its `From<Tier>` arm), and its place in the tier mapping the rules and chains use; without
all of these it is unreachable.

## Chains and image-out

`image-out` is the one trait that changes what a chain holds: an entry asking for it
(`*/standard[image-out]`) expands to image-output models whether or not they call tools. Every other
entry drops a tier's image models without a trace row, and a pinned image model is traced
`not-agent`. The vectors in `fixtures/catalogue/chains.json` and `fixtures/wildcard/expand.json`
(names starting `image-`) and in `fixtures/walk/choose.json`
(`plain-wildcard-never-picks-an-image-model`, `skip-pinned-image-model-not-agent`) pin both rules.

## Differences from the TypeScript

- The models.dev mapping that derives `vision` and `image-out` from a model's modalities is not
  mirrored; the crate reads the shipped `snapshot.json`, where those traits are already set.
- The test `image` catalogue layer exists only in the TypeScript fixture generator
  (`packages/ts/agent-router/scripts/fixtures.ts`); change it there and regenerate.
- Layers are checked by the strict schemas (`SnapshotLayer::parse`, `MachineCatalogue::parse`)
  instead of a generated JSON Schema. The vectors in `fixtures/catalogue/schema-*.json` hold the
  accept and reject cases.
- `layer_catalogue` reports a row whose values do not fit the row type as a `problems` entry; the
  TypeScript passes it through.
- Sizes are `u64`; a size beyond `u64` is not a size (the TypeScript accepts it as a float).
- Numbers: sizes are `u64`, so `ctx=9007199254740993k` or `ctx=99999999999999999999k` (which the
  TypeScript rounds to a float) is not a size here. Schema integers (`context.default`/`max`,
  `version`) must be JSON integers: `200000.0` and `1e6` pass zod's `.int()` but not serde's `u64`,
  while Rust accepts a `u64` above 2^53 that zod rejects as unsafe. The fixture comparison treats
  numbers by value, so int-vs-float output and precision above 2^53 are not pinned.
- Regexes: JavaScript's `\d` is ASCII, the `regex` crate's is Unicode. The crate writes `[0-9]` so
  both match the same digits; write `[0-9]` in any regex added here.
- Key order: a table keeps insertion order (`IndexMap`); JavaScript puts integer-like keys first.
  An alias named `4` therefore orders differently, which can change which alias `native_name`
  picks under `prefer_alias` and the order of alias problems. Contrived, not mirrored.
- Policy values are unvalidated: `ClassifyRule`, `MappingPolicy` and `Pins` are plain serde, so a
  rule with no `families`/`match`/`by_parameters`, `provider: []`, a bad threshold or an empty pin
  is accepted (an empty pin yields an entry with `native_name: ""`). `query_catalogue` takes them
  as given; the TypeScript rejects them in `RouterConfigSchema`.
- A malformed merged row (for example an unknown `status` such as `beta`) is dropped with a
  `problems` entry, where the TypeScript keeps it as current. Snapshot and machine layers are
  guarded by `parse`, so this only bites a caller that skips it.
- `layer_catalogue` does not require validated layers by type; pass layers through
  `SnapshotLayer::parse` / `MachineCatalogue::parse` first.
- `CatalogueQuery` holds the catalogue and the routing policy (pins, chain order, classify rules)
  together, as `query.ts` does; later modules read policy from the query, not the catalogue.
- The vectors are the only spec and their inputs exist only in TypeScript, so a new Rust function
  needs a vector in `packages/ts/agent-router/scripts/fixtures.ts` or it is not covered.
- `RouterConfigSchema` (the `router:` config block) is not mirrored; it belongs to the config
  subpath, which is out of scope.
- The author rule is not mirrored (only PR review uses it): no `authorRule`, `author` or
  `authorUnknown`, no `wait` or `person` outcome, no `step`, `authorStep`, `sameToolAsAuthor` or
  `modelMayMatchAuthor`. `ProfileSkipReason::AuthorTool` stays so the reason set equals the
  TypeScript's; this walk never produces it. The walk vectors drop `sameToolAsAuthor` (always
  `false` without the rule).
- Shape errors of `parse_profile`, `parse_profiles` and `parse_routing` carry this crate's own
  message, not zod's text. The vectors keep the `kind` (and a routing rule's `index`) and drop the
  message of an `invalid-shape`; every other error message is compared exactly.
- "Byte for byte" means after the strip: the walk vectors drop `sameToolAsAuthor` from the
  TypeScript output (the field exists only with the author rule), and `invalid-shape` messages are
  dropped on both sides (see above). Nothing else is stripped. The author-rule paths (`wait`,
  `person`, `author-tool`) have no Rust vectors; revisit the strip list
  (`withoutAuthorFields`, `withoutShapeMessage`) when the rule lands.
- Shape errors report the first issue only; zod's `ProfilesConfigSchema` joins every issue, and
  `routing[i]: not a valid rule` does not say which field failed. Both are this crate's own text.
- `RoutingWhen` (and `RouteRequest`, an alias of it) is `deny_unknown_fields`: an extra request
  attribute is a deserialize error here and ignored by the TypeScript's structural types. An
  explicit `null` is unset here (`Option`), while the TypeScript treats `profile: null` as a value
  and reports `invalid-profile`. Rule parsing is unaffected (it checks keys by hand).
- Profile order is the section's order, which needs `serde_json`'s `preserve_order` (declared in
  this crate's `Cargo.toml`; a vector with non-alphabetical names pins it). JavaScript puts
  integer-like profile names first (`{ "2": .., "1": .. }`); `IndexMap` does not, so which bad
  profile reports first can differ for such names. Contrived, not mirrored.
- `ChooseContext::is_available` is `&dyn Fn`, not `FnMut`, `Send` or `Sync`: a probe that mutates
  (budget counters, a cooldown cache) needs interior mutability, and an async probe does not fit.
  The TypeScript callback can be stateful; the first consumer that needs it should widen this.
- Left as they are, by choice: the reason enums (`AvailabilityReason`, `ProfileSkipReason`,
  `WildcardSkipReason`, `ChainSkipReason`, `ResolveErrorKind`) mirror the TypeScript unions and
  keep the flat wire shape the vectors pin; collapsing them, a `RoutingKey` enum in place of the
  string keys, folding the two skip paths in the walk, and `AuthorTool` (kept so the constants
  vector equals the TypeScript list) are refactors to do when the key set or the author rule
  grows, not in this PR.
- `resolve_ref`'s `check` is the `Check` enum (`Validity` without its error), and `ResolveError`
  is one struct with optional `effort`, `supported` and `hint` where the TypeScript has a union.
- `parse_routing` trims values as JavaScript's `trim` does (not Unicode `White_Space`).
- `unknown-profile`'s `known` list sorts by bytes; the TypeScript sorts by UTF-16 code unit. They
  differ only for names with characters beyond the Basic Multilingual Plane.
- Known gaps from the PR 1 review, left as they are: `chains` and `catalogue::query` call each
  other (`expand_chain` reads a `CatalogueQuery`, whose `tier_model` builds chains), which is
  legal inside one crate and mirrors the TypeScript's own cycle; the validated layers are not a
  newtype (`layer_catalogue` takes any layer, so call `parse` first); and provenance stays on the
  row (`Sourced<T>`), not flattened into the domain row, because the TypeScript's queries return
  the sourced rows too.
