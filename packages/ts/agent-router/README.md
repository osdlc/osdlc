# @osdlc/agent-router

The agent router: a model catalogue, and a resolver for references (`tool/model[ctx=…]@effort`) and
routing profiles, for launching coding-agent CLIs.

A workflow that launches an agent usually needs more than a tool name. It wants
a model, maybe an effort level, a fallback for when the tool is not usable, and
sometimes a reviewer that is not the tool that wrote the change. This library
answers one question: given a reference (or an ordered profile of references),
which tool, model and effort should run?

It is for a host that launches coding-agent CLIs (Claude Code, Codex, Cursor, Antigravity, pi,
opencode and the like) and wants one place to say "the strongest available model, but not the
tool that wrote this", with fallbacks, effort and context checked before anything starts. It is
not for routing a model's API calls between providers (use a gateway such as LiteLLM or
OpenRouter), and not for routing a model's tool calls or MCP requests. If you always launch one
fixed tool and model, you do not need it.

The main export is pure and browser-safe. Everything environmental is passed in: catalogue
layers, an availability callback, and the author of the change. It never spawns
a process, touches the filesystem or the network, or knows about git. Its one
import from `@osdlc/agent-call` is the `./models` subpath, which imports nothing.

The `@osdlc/agent-router/config` subpath is the exception. It exports the `profiles`, `routing`
and `router` config sections for a host to mount, needs the optional peer `@osdlc/config-layers`
(which brings yaml), and is not browser-safe. A host passes its own `consumers` paths, vocabularies and wording
to each section factory.

```ts
import {
  authorRule,
  chooseFromProfile,
  layerCatalogue,
  parseProfile,
  queryCatalogue,
  SNAPSHOT_LAYER,
} from '@osdlc/agent-router'

const catalogue = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
  pins: { 'codex/max': 'gpt-6.1-sol' },
})

const profile = parseProfile(['codex/max', 'claude/opus-5.5@high'])
if (!profile.ok) throw new Error(profile.error.message)

const choice = chooseFromProfile(profile.value, {
  catalogue,
  isAvailable: (resolved) => ({ ok: true }), // your installed / signed-in / budget check
  // A reviewer passes the author rule and the author; other callers pass neither.
  authorRule: authorRule({ not_the_author: true, if_only_author_left: 'different-model' }),
  author: { tool: 'claude', model: 'opus' },
})

choice.kind // 'chosen' | 'wait' | 'person' | 'none' | 'invalid'
choice.trace // one line per entry considered, and why it was taken or skipped
choice.skipped // the entries passed over, as { ref, reason, detail?, step? }
choice.summary // the closing statement, e.g. 'chosen: codex/max'
```

The model names above are examples. Tiers, efforts and models come from the catalogue (below);
`BUILTIN_QUERY` is the shipped snapshot's.

## Install

```sh
npm install @osdlc/agent-router zod
```

zod 4 is a peer: the package exports zod schemas, so they share your zod. The `./config` subpath
also needs `@osdlc/config-layers`, an optional peer: install it only if you use `./config`.

ESM only. Node.js 22 or later; Bun also works. Pure TypeScript with no platform-specific code, so
it runs on every operating system and in the browser (the main entry; `./config` needs Node).

New to it? Start with the [guide](docs/guide/getting-started.md): the problem, then one worked example from a
reference to a chosen launch, with the outputs shown.

The API reference is the TSDoc on each export, shipped in the package's `.d.ts` files; your
editor shows it on hover. The sections below explain the behaviour behind it.

## Words

| Word | Meaning |
| --- | --- |
| [Agent router](docs/planning/terms/TM-01-agent-router.md) | This library: it picks the tool, model and effort for a launch. |
| [Tool](docs/planning/terms/TM-02-tool.md) | A program the router can launch, such as `claude` or `codex`. |
| [Provider](docs/planning/terms/TM-03-provider.md) | The service that serves a model, such as Anthropic or a local Ollama. |
| [Reference](docs/planning/terms/TM-04-reference.md) | `tool/model[ctx=…]@effort`: `claude/opus`, `codex/max@high`, `pi/ollama/qwen3:4b`, `*/fast[local]`. |
| [Profile](docs/planning/terms/TM-05-profile.md) | A named, ordered list of references, tried in turn. |
| [Tier](docs/planning/terms/TM-06-tier.md) | A model band: `fast`, `standard` or `max`. |
| [Effort](docs/planning/terms/TM-07-effort.md) | How hard the model thinks: `none` to `max` on agent-call's `EFFORT_LEVELS`, where the tool accepts it. |

The full definitions are in the [planning folder](docs/planning/README.md), with the decisions
behind the design.

## The model catalogue

Facts about tools, providers, models and the offerings that join them
([D-06](docs/planning/decisions/D-06-catalogue-mapping-table-and-resolver.md)), as typed tables with
a query API.

| Table | Key | Holds |
| --- | --- | --- |
| `tools` | `claude` | binary (snapshot only), `serves`, `openness`, modes, how it takes model, effort and context, effort list, aliases, curated `offers`, `headless` template, version checked against |
| `providers` | `anthropic` | kind, endpoint, `key_env` (a variable name, never a key) |
| `models` | `anthropic/claude-opus-5-5` | family, release date, context, efforts, cost, traits, status |
| `offerings` | `claude × anthropic/claude-opus-5-5` | derived: `native_name`, `via`, efforts and context when they differ |

```ts
import { configLayer, layerCatalogue, queryCatalogue, SNAPSHOT_LAYER } from '@osdlc/agent-router'

const catalogue = layerCatalogue([SNAPSHOT_LAYER, configLayer(models, '2026-10-09')])
const q = queryCatalogue(catalogue)
q.findModel('claude', 'fable') // { model: anthropic/claude-fable-5-1, offering: { native_name: 'fable' } }
q.effortsFor('claude') // ['low', 'medium', 'high', 'xhigh', 'max']
q.tierModel('codex', 'max') // 'gpt-6-astra'
catalogue.problems // incomplete rows and dangling references
catalogue.warnings // a removal row for an unknown model; a problem under { strict: true }
```

**Layers**, lowest first. Each is plain data; reading a file is the caller's job.

| Layer | Where | Written by |
| --- | --- | --- |
| Shipped snapshot | `src/catalogue/snapshot.json` (`SNAPSHOT_LAYER`) | the release step below |
| Machine catalogue | `models/catalogue.json` in the vendor config home (below), one layer per source (`MachineCatalogueSchema`) | every writer, for the layers it owns |
| Config | the host's config, such as a `router:` section (`configLayer`) | people |

**The machine catalogue** is a file of layers a host writes on one machine, one layer per source
(`MachineCatalogueSchema`, versioned by `MACHINE_CATALOGUE_VERSION`). The package never reads or
writes it; the host decides where it lives and passes its layers in. Hosts that share one file,
so a model either finds is known to both, follow one writer rule:

*Writer rule.* A writer owns the layers whose `source` it names (for example `models.dev` or
`probe:ollama`). To write, it:

1. creates the directory, then takes the lock: an exclusive create (`O_EXCL`) of
   `catalogue.json.lock` beside the file, retried for up to 30 s, a lock older than 10 s being a
   dead holder's and broken. If the lock is still held after 30 s the write is refused and nothing
   is written. The lock file holds a unique token and is released only while it still holds that
   token;
2. re-reads the file under the lock, never trusting an earlier read. Only a missing file means
   nothing to keep: a file that exists but does not parse or validate is refused, never
   overwritten;
3. replaces every layer it owns with its own and keeps every other layer exactly as read,
   including a `source` it has never heard of. Order is stable so precedence never depends on the
   last writer: every existing layer keeps its position (an owned one is replaced in place, or
   dropped when the writer no longer has it) and new owned layers are appended;
4. validates the whole file with `MachineCatalogueSchema`, writes nothing when it fails, and
   otherwise writes a temp file beside the catalogue and renames it over it, then releases the lock.

A reader takes no lock: the rename is atomic.

A higher layer replaces a field of a row; `serves` adds instead, so `opencode: { serves: [corp] }`
adds a provider. The row takes the winning layer's `source` and `observed_at`, and `fields` keeps
the provenance of every field. A merged row missing a required field (a tool's `serves`,
`openness`, `modes`; a provider's `kind`) is left out, and it and any reference to an unknown
tool, provider or model are listed in `problems`. A `remove: true` row for an unknown model is
listed in `warnings` instead, or in `problems` under `layerCatalogue(layers, { strict: true })`.
A tool's `binary` is a snapshot fact, not
config: a built-in tool runs as the snapshot names it (`cursor-agent` for cursor), and a tool a
config declares runs as its id.

**Offerings** are derived: a `closed` or `open` tool offers `serves` times each provider's models; a
`curated` tool offers its own `offers`. A `router.offerings` row adds one or removes one
(`remove: true`); a row for an offering already there keeps the fields it leaves out, and a row
naming a tool the catalogue lacks is a problem, as is an added row naming a model it lacks.
`native_name` is, in order: the tool's alias when it declares aliases and sets `prefer_alias`; a
curated tool's own name; the provider's model id; `provider/id` for an `open` tool.

**`provider_keys`** marks a tool that calls each provider with that provider's key (`key_env`, or
credentials it stored), not through its own sign-in: opencode and pi. A caller's availability check
can then require the key for a cloud model; the catalogue itself never reads the environment.

**Efforts.** `effortsFor(tool, model)` is the offering's own list when it has one, else the
model's levels that the tool can pass. `[]` means the tool takes no effort; `undefined` means
nothing is declared. The resolver orders levels by `EFFORT_LEVELS` from `@osdlc/agent-call/models`
(`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, least to most reasoning), the set
agent-call's adapters translate.

## The mapping table

Policy over the catalogue
([D-06](docs/planning/decisions/D-06-catalogue-mapping-table-and-resolver.md)): which models each
tier means. Nothing is hand-kept; `queryCatalogue(catalogue, policy)` derives it from three inputs,
all optional.

**Classifier rules** (`classify.ts`) place each model in `fast`, `standard` or `max`, or leave it
`unclassified`. The first rule that applies (its `provider`, its `require_traits`) and matches (by
`families`, then `match` id globs, then `by_parameters`, a size read off the id such as
`qwen3:4b`) decides. `policy.classify` rules are tried before `BUILTIN_CLASSIFY_RULES`:

| Provider | fast | standard | max |
| --- | --- | --- | --- |
| anthropic | `claude-haiku` | `claude-sonnet` | `claude-opus` |
| openai | `gpt-luna` | `gpt-sol` | `gpt-astra` |
| google | `gemini-flash-lite` | `gemini-flash` | `gemini-pro` |
| ollama, lmstudio (agent models) | under 10B | under 40B | 40B and over |

A family no rule names (`claude-fable`, `gpt-terra`) is unclassified: it can be named exactly, but
no tier and no chain picks it.

**Category chains.** `expandChain(tier, traits, query)` lists the tier's models across
tools: tools in `policy.order` (default claude, codex, cursor, antigravity, pi, opencode; tools
it leaves out follow), and within a tool the current models the classifier places in the tier,
newest first, then larger context first. Only `agent` models carrying every trait stay, and
an image-output model never stands in a chain unless `traits` holds `image-out`, which takes the
models carrying it whether or not they call tools; the others come back in `skipped` with the
reason.

**Pins** (`policy.pins`, `{ 'claude/max': 'claude-opus-5-5' }`) freeze a tier on a tool: the pin
heads that tool's run of the chain and is what `tierModel` returns, whatever a newer release
does.

**The tier-per-tool mapping** is `tierModel(tool, tier)`: the pin, else the head of the tool's
run in the chain. On the snapshot, `claude` fast, standard, max = `haiku`, `sonnet`, `opus`;
`codex` = `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`. `pinned(tool, tier)` says whether a pin
set it; a resolved tier records it as `from.pinned`.

### Snapshot release step

Tool facts are copied from each installed CLI's help or listing on the day; a tool row carries
`checked_against` (the version) and `verify` (fields taken from documentation, not a run).

Run from the package directory, in a checkout of the repository:

1. `node scripts/models-snapshot.ts` fetches models.dev and prints the diff against the committed
   snapshot (`--from <api.json>` reads a saved copy instead).
2. Review the diff: added, removed and changed models, efforts and costs, and the tier-per-tool
   entries the classifier now maps differently (`~ tiers claude/max: …`).
3. `node scripts/models-snapshot.ts --write`, then run this package's tests and commit.

Traits: `local`, `agent` (calls tools), `embedding`, `reasoning`, `long-context`, `vision` (accepts
image input) and `image-out` (produces images). The models.dev mapping keeps text-output models with
or without tool calling (only `tool_call` models get `agent`) and models whose output includes
`image`; audio- and video-only output models are dropped. `vision` comes from `modalities.input`
holding `image`, `image-out` from `modalities.output` holding `image`. Ollama's `/api/show`
capabilities map `vision` to `vision` and `thinking` to `reasoning`.

models.dev supplies the model rows of `anthropic`, `openai` and `google`. Of a model's efforts it
keeps only the words on `EFFORT_LEVELS`, the only ones the catalogue schema accepts. The tools,
providers, and a model's efforts and aliases when models.dev has none (or none on the scale) are
kept from the snapshot. The row mapping is `modelsDevRows`, which a host's own refresh can share;
`diffCatalogues` gives both the tier moves, and a refresh also its new models, models gone and
newly unclassified families.

## References

A reference is `tool/model[qualifiers]@effort`. Only the tool is required.

| Reference | Meaning | Follows new releases |
| --- | --- | --- |
| `claude` | the tool, with its own default model | yes |
| `claude/max` | the tool's strongest tier | yes |
| `claude/opus` | the latest model in a family | yes |
| `claude/opus-5.5` | exactly that model | no |
| `claude/opus-5.5@high` | that model at high effort | no |
| `claude@high` | the tool's default model at high effort | yes |
| `pi/qwen2.5-coder:7b` | a specific local model | no |
| `pi/ollama/qwen2.5-coder:7b` | a provider-qualified model | no |
| `claude/opus[ctx=1m]@high` | at least 1,000,000 tokens of context | yes |
| `claude/max[ctx=max]` | the strongest tier at the largest context it offers | yes |
| `*/fast` | the `fast` category chain across every tool | yes |
| `*/fast[local]` | the same, local models only | yes |

Parsing rules:

- Split off the effort at the last `@` that follows the last `]`, then a
  trailing `[...]` group as qualifiers, then the tool at the first `/`. The rest
  is the model string, passed through unchanged. Without qualifiers a model name
  therefore cannot contain `@`: in `pi/user@host/model` the effort is `host/model`,
  which is no level, so it is an `unknown-effort` error.
- The tool is a lower-case identifier matching `^[a-z][a-z0-9-]*$`, or `*` with a
  tier; anything else (`Claude/max`) is an `invalid-tool` parse error. A bare `*`
  or `*/opus` is `wildcard-needs-tier`. Tool comparison, including the author
  rule, is exact.
- Qualifiers are `ctx=<size>` (`digits` plus `k` or `m`, decimal, at most
  `MAX_SIZE` (`Number.MAX_SAFE_INTEGER`) tokens, or `max`) and
  trait names (`TRAITS`), each once (`duplicate-qualifier`). Traits only filter,
  so they need a tier or a wildcard: `claude/opus[local]` is `traits-need-tier`.
  A tool's own bracket (`opus[1m]`, `[context=1m]`) is `native-bracket`, whose
  message gives the reference form `[ctx=1m]`.
- `:` is never a separator, because local model tags contain it.
- The model part is a **tier** when it is exactly `fast`, `standard` or `max`.
  Those words are reserved. Otherwise it is a model name; the library does not
  tell a family (`opus`) from a pinned id (`opus-5.5`), because only the tool
  can.
- `parseRef` returns a typed error for an empty tool, an empty model after `/`, an empty effort
  after `@`, an empty reference, any whitespace, an effort that is not one of agent-call's
  `EFFORT_LEVELS` (`unknown-effort`), a model a CLI would read as a flag (it, or a part after a `/`,
  starts with `-`) or that holds a control, zero-width or bidi character (`invalid-model`;
  `modelProblem`, which `router.pins` values follow too), input that is not a string
  (`not-a-string`), and the qualifier errors above. It never throws. `formatRef` prints qualifiers
  in canonical order (`ctx` first, then traits sorted), so `formatRef(parseRef(x))` returns `x` when
  `x` is canonical.
- In YAML, quote a reference that starts with `*`, and one containing `[` inside
  a flow list (`["claude/opus[ctx=1m]", codex/max]`); a block list needs no
  quotes.

A reference resolves against the catalogue alone (`resolveRef(ref, { catalogue })`): it is checked
first (`checkRef`, below), then a tier maps through `tierModel`. A tool with no model for the tier
is a `no-tier-entry` error: unknown names refuse to run. Effort is checked against
`effortsFor(tool, model)`. When nothing is declared the effort is passed through and the result is
marked `effortUnchecked: true`; a walk traces it and adds it to `chosen.warnings`. An empty set
means the tool supports no effort, so any effort is an `unsupported-effort` error.

An effort the set does not hold moves at most one step on `EFFORT_LEVELS`
(`adjustEffort`): one step up when that level is accepted, else one step down,
else it is an `unsupported-effort` error that lists the accepted levels. Steps
count on the full scale, so `none` is two steps from `low`. The result's
`effort` is the level used, `effortAdjusted` records `{ requested, direction }`,
and `text` keeps the reference as written. A profile walk traces the move and
adds it to `chosen.warnings`. For a model whose levels stop at `high`,
`xhigh` runs at `high`; `antigravity@max` is an error, two steps from `high`.

The snapshot's effort sets: `claude` accepts
`low`, `medium`, `high`, `xhigh` and `max`, narrowed per model where the model
takes fewer; `antigravity` has `low`, `medium` and `high`, because `agy
--effort` takes those three. Its model slugs are undocumented, so it is handed
the provider's model id, and the row lists `serves`, `model` and `effort` under
`verify`.

The tools are the catalogue's (`knownTools()`); a reference to any other tool is
an `unknown-tool` error. Callers that want a narrower set pass `knownTools` in
the context. `resolveRef(ref, ctx)` and `validateProfile(profile, ctx)`
take the same context as `chooseFromProfile`, less `isAvailable` and `author`.
`resolveRef` refuses a wildcard (`wildcard`): only a profile walk expands one.

## Context

`ctx=` means "at least this much", and so does a profile's `context:`. The
profile walk compares the larger of the two to the catalogue's size for the
resolved model, in one function, `checkContext`:

| Case | Result |
| --- | --- |
| an entry's `[ctx=]` above what its model offers anywhere | error: the profile is `invalid` |
| the model offers less than asked on this tool | skip, traced with the sizes |
| the model has no known size | the entry stays with `contextUnchecked: true` and a warning |
| `ctx=max` | the model's size on the tool |

The chosen `resolved.context` holds the size, and `isAvailable` sees it; it
never skips on context itself. `contextArgs(tool, model, size, defaultContext)`
translates a size into a tool's form: `opus[1m]` for Claude (its one variant,
above its 200k default; nothing at or under it; above 1m `contextUnchecked: true`,
since `[1m]` does not reach the size), `model[context=1m]` for Cursor,
`num_ctx` for an Ollama runtime. Codex's config key is unverified, so Codex, and
any tool with no context form, needs nothing for a size the window the tool
runs the model with already covers, and gets nothing and
`contextUnchecked: true` for a larger one, or when no window is known. That
window is `defaultWindow(catalogue, tool, model)`: the catalogue's `default`,
the offering's before the model's. A `max` is never taken for it, since a
model's largest size is not what a tool gives it: models.dev's
`limit.context` is the API maximum, and an Ollama model's `context_length` is
its trained maximum while Ollama runs it at its own `num_ctx`. The snapshot's
codex offerings carry codex's own `context_window` (272k for its listed
models) as `default` and `max_context_window` as `max`, from codex's model list
(`~/.codex/models_cache.json`, codex 0.162). Nothing else the snapshot or a
refresh writes states a `default` (a project may declare one in
`router.offerings`), so on any other tool with no form a size is
`contextUnchecked`, and a launcher should refuse it.

## Wildcards

`*/<tier>` in a profile entry expands to the tier's category chain (`expandWildcard`, over
`expandChain` and `ctx.catalogue`), kept to `knownTools`. A tool's head is the candidate
`<tool>/<tier>`; later models are named (`claude/claude-haiku-4-5`). A candidate is skipped and
traced when it does not resolve (an effort more than one step from the tool's), when its model is
`embedding` or not `agent`, when it lacks a trait the entry asks for, or when it cannot reach the
wildcard's `[ctx=]`. An image-output model a tier places is dropped without a trace row unless the
entry asks for `[image-out]`; only a pinned image model is traced as `not-agent`. A wildcard that
expands to nothing is skipped and traced. The same trait filter applies to a tier entry
(`claude/fast[local]`). A `tool:` binding may be a wildcard too: `resolveBinding` walks it as a
one-entry profile.

## Validity

`checkRef(ref, catalogue, { strict?, knownTools? })` checks a reference against
the catalogue before availability. `resolveRef`, `validateProfile` and
`chooseFromProfile` call it on every entry, with `strict` and `knownTools` from
their context.

| Result | When | In a profile |
| --- | --- | --- |
| `error` | unknown tool, a tier the tool has no entry for, a tool that does not serve the model's provider (`codex/sonnet`), a model the tool does not offer, an effort more than one step from any the tool and model accept (`claude/opus@none`, `antigravity@max`), an effort that is no level at all (`unknown-effort`, for a reference built in code), an unknown model under `strict` | the profile is `invalid` |
| `skip` | a model the catalogue marks `withdrawn`; in the walk also a context the model cannot reach here, a missing trait, a wildcard that expands to nothing | traced as skipped; the walk continues; all skipped gives `none` |
| `warning` | a model unknown to the catalogue, or `deprecated` (even under `strict`) | the entry stays; the trace and `chosen.warnings` carry it |
| `ok` | known and valid | |

Each result but `ok` has a `code` and a `message`. An error names the nearest
valid reference in `hint` when the catalogue knows one (`claude/sonnet`), and an
effort error lists the accepted levels in `efforts`. An effort one step from an
accepted level is `ok`; the resolve moves it, as above. An effort more than one step from any
accepted level is an error. Effort on a model the catalogue
does not know is checked against the tool's own levels only.

## Profiles

A profile is an ordered list of references. The first available one runs.

```yaml
profiles:
  mechanical: [pi/qwen2.5-coder:7b, claude/fast, codex/fast]
  author: [claude/standard, codex/standard]
  reviewer: [codex/max, claude/opus-5.5@high]
```

Two profiles are built in, `default` (`['*/standard']`) and `small` (`['*/fast']`):
`parseProfiles` returns them beside the section's own, and an entry of the same name
replaces one whole (`BUILTIN_PROFILES`).

The long form takes `order` plus `host` and `context` (a size, `1m`). The author rule is not a
profile key: the caller passes it ([The author rule](#the-author-rule)). A profile does not choose
its launch mode: the caller's launcher does. The shapes are validated with zod;
`ProfileConfigSchema` and the inferred types are exported.

`chooseFromProfile(profile, ctx)` is synchronous and deterministic. It first
resolves every entry; an entry that does not resolve (an unknown tool, no tier
entry, an effort more than one step off, tool outside `knownTools`, a validity error) makes
the whole profile `invalid` and nothing is chosen. `validateProfile(profile,
ctx)` returns the same errors without choosing, for callers such as a doctor
command. It then walks `order`, skipping validity skips and entries that are not
available (the callback returns one of `AVAILABILITY_REASONS`: `not-installed`,
`not-signed-in`, `over-budget`, `cooling-down`, `provider-unreachable`,
`model-not-present`, `not-launchable`, `other-tool` or `untrusted-fork`, and may add a `detail`
the trace shows after it), and returns one of:

| Outcome | Meaning |
| --- | --- |
| `chosen` | run this `resolved` entry; `sameToolAsAuthor` says whether the author rule had to be relaxed; `allCooling` says every usable entry was cooling and the first was taken anyway; `warnings` holds the catalogue's warnings about it |
| `wait` | no other entry is available or cooling down, some entry was set aside by the author rule, and the rule says to wait |
| `person` | the same, and the rule says to hand it to a person |
| `none` | nothing is available and nothing was set aside by the author rule (or, under `different-model`, no author-tool entry is available); a cooldown alone never gives `none` |
| `invalid` | an entry (or `ctx.author.tool`) is unusable; `errors` names each entry text and why |

When no entry is available but some were skipped only for `cooling-down`, the
first of those is taken and the choice carries `allCooling: true`: a rate limit
is a reason to prefer another entry, not to stop.

Every outcome carries a `trace`, exactly one line per entry considered with the reason it was taken
or skipped (the author rule's lines name the step), and a `summary` string with the closing
statement. A run log or a UI can show them as is. `skipped` holds the same skips as data,
`{ ref, reason, detail?, step? }`, and never the chosen entry: `reason` is a code from
`PROFILE_SKIP_REASONS`, `detail` what failed, and `step` the author rule's step that decided it.
`skipReasonText(skip)` is the trace's wording. A host can record the same `{ref, reason, detail?}`
in its run log, so a report can group skips by code:

| `reason` | The entry was passed over because |
| --- | --- |
| `not-installed` | its tool is not installed |
| `not-signed-in` | its tool, or the provider key it calls with, is not signed in |
| `over-budget` | the usage budget is spent |
| `cooling-down` | it is cooling down after a rate limit |
| `provider-unreachable` | its local runtime is not answering |
| `model-not-present` | its local runtime does not hold the model |
| `not-launchable` | the launcher cannot run it: no launch for the mode, a model or context size the tool cannot be given |
| `other-tool` | it is on a tool other than the one the session runs |
| `untrusted-fork` | its tool may not run on an untrusted fork's tree |
| `not-agent` | a wildcard candidate whose model is not an `agent` model (or is an `embedding` one) |
| `missing-trait` | its model lacks a trait the entry asks for (`[local]`) |
| `unresolved` | a wildcard candidate that does not resolve (an effort more than one step from its tool's) |
| `withdrawn-model` | the catalogue marks its model withdrawn |
| `below-context` | its model offers less context on its tool than asked |
| `no-candidate` | a wildcard expanded to nothing |
| `author-tool` | the author rule's step 1: it is on the author's tool |

`refProfile(ref)` is the one-entry profile a `tool:` binding walks as. `ctx.author.tool` must
match the tool-id pattern, else the outcome is `invalid`.

## The author rule

The rule belongs to the caller whose work has an author, not to a profile: it
passes `ctx.authorRule` (`{ notTheAuthor, ifOnlyAuthorLeft }`) with the walk.
A host reads it from its own config: `authorRuleFields` are the zod fields for
the keys `not_the_author` and `if_only_author_left`, and `authorRule(config)`
applies their defaults (off, then `different-model`). Without `ctx.authorRule`
no entry is set aside.

A caller's per-run override is not second-guessed: when a person names the
tool for one run, the host passes no rule. If that pick lands on the author's
tool, the host can warn, naming the author's tool and the chosen reference.

With `notTheAuthor` and a known author, every entry whose tool is the
author's tool is skipped. With `ctx.authorUnknown` instead (the work has an
author nobody could establish), any tool may be the author's, so every entry is
set aside and `ifOnlyAuthorLeft` decides. Using the reviewer profile above with
`notTheAuthor` and `different-model`:

| Who wrote the change | Who is available | Result |
| --- | --- | --- |
| Claude Code | Codex and Claude Code | Codex reviews (`codex/max`) |
| Codex | Codex and Claude Code | Claude Code reviews (`claude/opus-5.5@high`) |
| Claude Code | Claude Code only | `ifOnlyAuthorLeft` decides (below) |
| unknown (`ctx.authorUnknown`) | both | `ifOnlyAuthorLeft` decides; under `different-model`, `codex/max`, flagged `modelMayMatchAuthor` |

When only the author's tool is left:

- `different-model` (the default), among the available author-tool entries:
  (a) an entry whose resolved model is explicit and differs from the author's
  known model (two names of one catalogue model, `opus` and `claude-opus-5-5`,
  do not differ); otherwise (b) the first model of that entry's tier on the
  author's tool, in chain order, that passes the entry's trait filter (`[local]`
  and the like), differs from the author's and is available, never a lower
  tier (a tier entry's own tier, a named model's
  catalogue tier); otherwise (c) the first available author-tool entry, with
  `modelMayMatchAuthor: true` on the choice. Case (c) covers an unknown author
  model, a tool-default entry (no model), an unclassified model, and a tier with
  no other available model. If no author-tool entry is available the
  outcome is `none`. Either choice carries `sameToolAsAuthor: true` so the caller
  can say so on the pull request, and the trace says which case applied.
- `wait` / `person`: these apply whenever no non-author entry is available and at
  least one entry was set aside by the author rule, whether or not the
  author-tool entries are themselves available (waiting, or a person, is the
  right answer either way). A non-author entry skipped only for `cooling-down`
  is taken first, with `allCooling: true`. The outcome is `{ kind: 'wait' }` (the caller
  retries later) or `{ kind: 'person' }` (the caller hands the review to a
  person). `none` is only for nothing available and nothing set aside.

## Workflow bindings

A binding names exactly one of a profile or a reference (`tool`).
`resolveBinding({ profile } | { tool }, profiles, ctx)` rejects neither or both, a binding that is
not an object and a `tool` that is not a string (all `binding-invalid`, never a throw), and rejects
an unknown profile name. `profile` is a name in `profiles` or an inline list of references
(`['claude/opus', 'codex']`), which walks as an unnamed profile: availability and the author rule
apply as they do to a named one, and an inline list that does not parse is an `invalid-profile`
error. A `tool` binding walks as a one-entry profile. An unresolvable entry surfaces as an `invalid`
choice, as above.

A wildcard `tool` (`*/max`) walks like the same entry in a profile: through the chain order the
caller's catalogue policy sets (`order`), or the built-in `DEFAULT_CHAIN_ORDER` when it sets none.

## Routing rules

`parseRouting(input, vocabulary?)` reads a list of `{when, profile}` rules.
`when` may test `workflow`, `stage`, `complexity`, `impact`, `autonomy` and
`tags`; any other key is an error. A `vocabulary` gives a key its closed set
of values, and a value outside it is an error naming the rule index and the
valid values. `matchRule(rules, request)` returns the first rule whose every key
holds for the request, with its index: `tags` holds when the request carries
any listed tag, and a key the request lacks does not hold. `shadowedRules(rules)`
lists each rule an earlier rule with the same or a broader `when` always beats.
The caller resolves the matched rule's profile through `resolveBinding`; whether
the profile exists is the caller's check.

```ts
const rules = parseRouting([
  { when: { workflow: 'implement', complexity: 'small' }, profile: 'small' },
  { when: { workflow: 'implement', complexity: 'large' }, profile: 'deep' },
])
matchRule(rules.ok ? rules.value : [], { workflow: 'implement', complexity: 'large' })
// { index: 1, rule: { when: { … }, profile: 'deep' } }
```

## Stability

These exports are experimental: their shape may change in any release, and a
change to them is not a breaking change.

- From `@osdlc/agent-router/config`: `profilesSection`, `routingSection`, `routerSection`,
  `ProfilesSectionOptions`, `RoutingSectionOptions`, `RoutingSectionVocabulary` and
  `RouterSectionOptions`.
- The detection report: `DetectReportSchema`, `DetectRuntimeSchema`, `DetectToolSchema`,
  `DetectHost`, `DetectModel`, `DetectProvider`, `DetectReport`, `DetectRuntime` and
  `DetectTool`.

Everything else is stable within the 0.x minor line: a breaking change bumps the minor
version.

## What it deliberately does not do

- It does not spawn anything. Launching is `@osdlc/agent-call`'s job.
- It does not detect availability. Whether a tool is installed, signed in, within
  budget or cooling down after a rate limit is the caller's callback.
- It does not record the author. The caller supplies `author`.
- It does not refresh the catalogue or probe tools. The snapshot is regenerated
  at release; the machine catalogue and config layers arrive as data, written by the host.
- It has no CLI and does not read configuration files.

## Prior art

Most libraries called a router route a model's API calls (LiteLLM's router, OpenRouter's
fallbacks, Portkey's gateway, the Vercel AI SDK's provider registry) or pick a model per prompt
(RouteLLM, Not Diamond). Those choose between endpoints for one request; this chooses which
coding-agent CLI session to start, before it starts. Proxies such as claude-code-router reroute one
CLI's API traffic to other providers, which is a different layer again. In the same family of
libraries, `@osdlc/agent-call` launches what this resolves, and `@osdlc/detect-harness` finds the
installed tools an availability callback can check.

The naming stays compatible with the `provider/model-id` convention used by pi,
opencode and OpenRouter: text after the first `/` is handed to the tool
unchanged. Ordered lists follow the fallback arrays of LiteLLM and OpenRouter,
with one difference: those react to a failed API call, while this checks
availability before launch, because a coding-agent session is too expensive to
start and discover a rate limit.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
