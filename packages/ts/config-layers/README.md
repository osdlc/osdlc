# `@osdlc/config-layers`

A CLI tool's two config files, the sections its project file is built from,
and the check a command runs before it starts.

A tool that runs inside a project has a committed config file there, and often
a second file for settings that only mean something on one machine. Both are
read through a Zod schema, a local overlay can override the committed file, and
a command that cannot run without a setting wants one clear message when the
setting is missing. This package is that machinery: section-based project
config with a memoized loader, a never-throwing machine file with migrations, a
`paths:` map of named directories, and the "needs" check. It also holds the
pieces a `config` command is built from: key explanations, edits that keep
comments, a scaffold file and a markdown reference page, all derived from the
schema.

It is for CLI tools, written in TypeScript, that own a config format and want it
validated, explainable and editable.

When not to use it:

- You want to find a config file in any of many places and formats. `cosmiconfig`
  and `c12` do that.
- You do not use Zod. The schema walk reads Zod 4 types.
- You need Windows support today. See Platforms.
- You want a config library that knows nothing about CLI tools. Parts of this one
  (needs messages, `config set` edits, scaffold files) assume a tool with a
  command line.

## Install

```sh
npm install @osdlc/config-layers zod
```

`pnpm add @osdlc/config-layers` and `yarn add @osdlc/config-layers` work too.

ESM only. Node.js 22 or later.

## Quick start

<!-- snippet: quick-start -->

```ts
import { configNeeds, envVars, machineConfigFile } from '@osdlc/config-layers'
import { z } from 'zod'

const ProjectSchema = z.object({
  upload: z
    .object({
      endpoint: z.string().default('').describe('The server that receives uploads.'),
    })
    .prefault({}),
})
const MachineSchema = z.object({ repos: z.array(z.string()).default([]) })

const machine = machineConfigFile({
  tool: 'tooly',
  schema: MachineSchema,
  vendorDirs: { vendor: 'com.example', envVars: envVars('TOOLY') },
})
const needs = configNeeds({
  tool: 'tooly',
  projectFile: 'app.yaml',
  projectSchema: ProjectSchema,
  machine,
  scaffoldHint: '`tooly config scaffold` shows the full shape',
})

const need = { config: 'upload.endpoint', unlessInput: 'endpoint' }
const project = ProjectSchema.parse({})
let message = ''
if (!needs.met(need, { project, input: {} })) {
  message = needs.message(need, { projectRoot: '/work/app', command: ['upload', 'run'] })
}
// `tooly upload run` needs `upload.endpoint`, and it is not set (or pass
// --endpoint). The server that receives uploads. Set it in an app.yaml at the
// project root (none above /work/app); `tooly config scaffold` shows the full
// shape.
```

The snippet runs as `examples/quick-start.test.ts`.

## Why

A tool that runs inside a project has a committed config file there. A path
like `~/Developer` that only means something on one laptop has no honest
place in a committed file, so the same tool wants a second file that never
leaves the machine. And every command that cannot run without a setting
checks for it by hand, with its own wording and exit code, and nothing lists
which settings a command depends on.

This package is those three things once: the machine file's location and
loader, the two-schema lookup, and the one message an unmet need renders.

## The machine file

`machineConfigFile({ tool, schema, vendorDirs })` names `<config>/<tool>/config.yaml` in the tool's
standalone config home
([`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs):
`~/Library/Application Support` on macOS, `${XDG_CONFIG_HOME:-~/.config}` elsewhere).
`vendorDirs`
is `{ vendor, envVars }`: the vendor and the override variables (`<PREFIX>_ROOT`,
`<PREFIX>_CONFIG_DIR`) that move the config home, supplied by whoever ships the tool.

| Member | Does |
|---|---|
| `path()` | the file's path; `<STEM>_MACHINE_CONFIG` (`TOOLY_MACHINE_CONFIG`) overrides it |
| `load()` | the file parsed through `schema`, all defaults filled; never throws |
| `loadWithIssues()` | `{ value, issues }`: `load()`'s value plus one issue per thing it dropped |
| `clearCache()` | drop the memoised value (tests) |
| `check(raw)` | the load issues `raw` would have that the file on disk does not |
| `write(text)` | replace the file: throws, writing nothing, if `check` finds a new issue; keeps `<file>.bak`; atomic |
| `migrate({ dryRun? })` | run the migrations on disk: `{ path, from, to, applied, written }`; writes only when one applied |
| `currentVersion` | the last migration's `to`, or 1 |
| `env` | the override variable's name |

The schema is the contract: every key carries a default, so `schema.parse({})` is the all-defaults
object a missing, unreadable or non-mapping file degrades to. A file that fails the schema is
salvaged: each unknown key is dropped, then each section that is still invalid takes its default,
and the rest is kept. Every drop is a `MachineConfigIssue` (`path`, `code` — `unknown_key`,
`invalid`, `unreadable`, `yaml`, `not_mapping` or `newer_version` — and `message`). The loader never
prints them; the tool decides how to show them. Options `env`, `fileName` and `dirs` change the
variable, the file name and how the directories are resolved (a test injects a rooted one).

Option `migrations` is an ordered `MachineMigration[]` (`{ from, to, run(raw) }`). The schema should
declare an optional integer `version`; a file without one is version 1. The loader runs every step
from the file's version on, in memory, before validation. A file newer than the last step is read
as-is with a `newer_version` issue. `migrate()` persists the result through `write`, which keeps a
`.bak` but not the file's comments. `migrateMachineRaw` is exported on its own. The write itself
goes through `@osdlc/etag-write`.

The library ships no machine schema. `pathsSchema` and `substitutePathNames` (`paths.ts`) are the
`paths:` map a tool's machine and project schemas can share.

## Needs

A command declares what it cannot run without:

A need is `{ config, unlessInput? }`. `config` is a dotted key such as `upload.endpoint` or
`paths.dev`. `unlessInput` names an input that stands in for it: `endpoint` for `--endpoint`.

`configNeeds({ tool, projectFile, projectSchema, machine, scaffoldHint? })`
returns:

| Member | Does |
|---|---|
| `met(need, { project, input })` | true when the input stands in, or the key is set in the project config or the machine file |
| `message(need, { projectRoot, command })` | the one message an unmet need renders |
| `whereToSet(key, projectRoot)` | the "set it in ..." clause on its own |
| `keyScopes(key)` | which schemas carry the key: `{ project, machine }` |
| `keyExists(key)` | either does |
| `keyDescription(key)` | the first sentence of the key's `.describe()` prose, project schema first |

"Set" means not undefined, null, empty text, an empty list or an empty map,
so a schema default like `repos: []` still counts as unset.

The message says where to set the key from what the schemas allow and
where the person stands. A key only the project schema carries names the
project file. A key only the machine schema carries names the machine file
by path. A key both carry names both, the project file first when one
exists at `projectRoot`, the machine file first otherwise, with the project
file described ("a tooly.yaml at the project root (none above /here)")
rather than pointed at.

## Named directories

Both files may carry a `paths:` map, and any other path-valued setting
refers to an entry as `{name}`:

```yaml
paths:
  dev: ~/Developer
repos:
  - '{dev}'
  - '{dev}/work'
```

<!-- snippet: named-directories -->

```ts
import { pathNames, substitutePathNames } from '@osdlc/config-layers'

const machinePaths = { dev: '~/Developer' }
const projectPaths = { docs: './docs' }
const names = pathNames('/work/app', machinePaths, projectPaths, { home: '/home/me' })
// { dev: '/home/me/Developer', docs: '/work/app/docs' }

const repo = substitutePathNames('{dev}/work', names, 'repos:')
// '/home/me/Developer/work'
```

| Member | Does |
|---|---|
| `pathsSchema({ reserved })` | the map as a schema: a name (letters, digits, `_`, starting with a letter) → a directory, refusing any `reserved` name a consuming setting defines itself |
| `pathNames(baseDir, machine, project, opts?)` | the effective map: machine entries over project ones, each `~`-expanded and absolute; `opts.home` is what `~` expands to |
| `substitutePathNames(value, names, where, opts?)` | `value` with every `{name}` replaced; `PathNameError` for one nothing defines, naming `where` it appeared, what is available, and `opts.defineHint` |
| `resolveConfigPath(value, baseDir, opts?)` | the one `~` and relative expansion every config path value goes through; `opts.home` defaults to `$HOME`, or `os.homedir()` when `HOME` is unset; an empty home leaves `~` unexpanded; only `~` and `~/…` expand |

An unknown path name is an error rather than an empty string: a setting that
quietly becomes `/repo` instead of `/Users/me/dev/repo` fails somewhere far
from the typo.

## Pieces

`valueAt(obj, key)`, `valueIsSet(value)`, `leafSchema(schema, key)`,
`keyExists(schema, key)`, `keyDescription(schema, key)` and `envStem(tool)` are exported for a
tool that needs one of them without the rest. `leafSchema` walks a Zod object by dotted key,
keeps the outermost wrapper (that is where `.describe()` sits), and resolves a key under a record
to the record itself.

`systemDirs` and the `VendorDirs` type resolve a tool's machine-local directories over `TieredDirs`
and `envVars`, which are re-exported from `@osdlc/tiered-dirs`. `closestMatches` and `didYouMean`
suggest close names for a mistyped noun, verb, key or repo.

The schema walk reads Zod's private `_def` layout by tag name rather than
`instanceof`, so a second copy of zod in a consumer's tree still resolves.
A tripwire test fails loudly if a zod release moves that layout, and
`tests/zod-copy.test.ts` loads a config through a second copy of zod.

## Sections and the loader

The project file is built from **sections**, one per top-level key. A section is
made by `defineConfigSection({ key, schema, meta, fileSchema?, layerCheck? })`:
the schema carries the key's `.describe()` prose, `meta` is the per-key metadata
(`category`, `consumers`, `layers`, `applies_via`, `enforcement`, `runs_in`;
`meta.ts`) registered as the last call on the chain, `fileSchema` is the schema to
validate ONE file alone with (a section whose check spans fields a project may
split between the two files supplies its un-refined variant), and `layerCheck`
receives the raw per-layer values and the parsed merged value for rules only
visible with layer knowledge.

The words that fill `meta` are the tool's. `defineConfigVocabulary({ categories, appliers,
layers, runContexts, enforcement: { levels, reserved?, applied? } })` (`vocabulary.ts`)
returns the enum schemas for them, a `defineSection` that type-checks a section's meta
against them, and `checkMeta`/`readMeta`. `layers` must include the three the library
reads itself (`project`, `local`, `machine`) and may add more. A section defined with the
plain `defineConfigSection` carries plain strings; `checkConfigMeta(shape)` with no
vocabulary checks only their structure.

`assembleConfig({ file, sections, unknownTopLevel, label?, parseProblem?,
crossFieldIssues? })` builds a handle from the sections a tool mounts:

| Member | Does |
|---|---|
| `schema` / `fileSchema` | the strict schema over every mounted section, and its single-file twin |
| `load(root)` | the project file with the overlay deep-merged over it BEFORE validation, validated once, memoized per resolved file; reloads when either file's stat signature changes |
| `loadLayers(root)` | `load`, plus the two raw layers and the resolved `files` |
| `readLayers(root)` | the raw layers without validating, for diagnostics of a broken file |
| `clearCache()` | drop the memo (tests) |

`unknownTopLevel` says what a top-level key no mounted section owns means: `'warn'` (a tool that
mounts every section) removes an unknown key at ANY depth from the parsed copy and reports it
(`loadLayers(root).unknownKeys`, `{ file, path }` per key, and one stderr line per file and key per
handle); the file on disk is never rewritten, so a newer tool's key does not break an older one.
`'reject'` fails the file on an unknown top-level key; `'ignore'` (a standalone tool that mounts a
few) drops the key unparsed, however malformed, with no warning. Whatever the mode, a
present-but-invalid mounted section and a file that is unreadable, not YAML or not a mapping are a
`ConfigInvalidError`, exit `CONFIG_INVALID_EXIT` (14), and a nested unknown key is one too under
`'reject'` and `'ignore'`. `stripUnknownKeys` is the shared piece: the machine config's salvage uses
it for the same drop. A file that does not exist is not an error: neither file present is the
all-defaults object.

`readParsedFile(path, 'yaml' | 'json')` is the one read of a config file's bytes (absent,
unreadable, unparsable or the parsed value); `readMappingFile` is its mapping-only layer.

## Where the file is

`resolveConfigFile(projectRoot, { name, envVar })` is the only function that finds the
file, and returns `{ project, local, source: 'env' | 'default' }`. The tool names the file
and the variable; there is no default. With `{ name: 'tooly.yaml', envVar: 'TOOLY_CONFIG' }`
the pair is `<root>/tooly.yaml` and `<root>/tooly.local.yaml`. While `TOOLY_CONFIG` is set it
REPLACES that pair (neither root file is read) with the file it names and that file's overlay:

- a relative path resolves against the process working directory at startup, and the
  absolute path is what every caller prints;
- the overlay is `<dir>/<basename without its last extension>.local.<ext>`: `tools/tooly.yaml`
  pairs with `tools/tooly.local.yaml`, `cfg.yml` with `cfg.local.yml`;
- a set variable naming a missing file is a `ConfigInvalidError`; an absent default file is not;
- `scope: 'subtree'` resolves a directory beneath the root (a per-directory overlay file) to its own
  default pair, since the variable names the root file only;
- the machine file (`<STEM>_MACHINE_CONFIG`) and the trust store are not affected.

The package does not search upward for the project root: the caller passes it. The Rust twin has
`find_up` for that; see the table in "Rust twin".

A file named by the variable is project-sourced for a repository-trust gate exactly like
the default file, so pointing it outside the repository is not a way around it.

## Meta, provenance, explain, edit, scaffold, reference

The general machinery a `config` command is built from, none of it naming a tool:

| Module | Exports |
|---|---|
| `meta.ts`, `vocabulary.ts`, `meta-kit.ts` | the meta structure, `defineConfigVocabulary`, and `checkConfigMeta`/`readConfigMeta`; the completeness test kit (`consumerProblems`, `enforcementProblems`, `machineLayerKeys`, `applierAndReservedProblems`) a tool's meta test calls, each returning its problems |
| `provenance.ts` | `resolveLayeredSteps`/`resolveLayeredValue`: the env, local, project, default cascade with `{layer, mode}` provenance (`ValueLayer`, `StepProvenance`) |
| `explain.ts` | `resolveKeyPath`, `splitKeyPath`, `describeShape`, `defaultOf`, `nestedFields`, `jsonSchemaOf`, `getIn`, `omitPath` over a schema shape |
| `edit.ts` | `setPath`/`unsetPath`: span-preserving dotted-path edits over `@osdlc/yaml-splice` |
| `scaffold.ts` | `scaffoldYaml`, `scaffoldLocalYaml`, `starterYaml`: an annotated file derived from the schema (the starter groups keys in the caller's category order) |
| `reference.ts` | `renderReference`: a markdown reference page from the schema and its meta, grouped in the caller's category order |
| `merge.ts` | `deepMergeConfig`: mappings merge per key, arrays and scalars replace |

## Runtime

`node:` APIs only. Dependencies: `@osdlc/tiered-dirs`,
`@osdlc/etag-write`, `@osdlc/gfm-table`, `@osdlc/yaml-splice`, `yaml`. Peer dependency: `zod` `^4`.

## Rust twin

The Rust crate [`config-layers`](https://crates.io/crates/config-layers) is the twin of this
package. It is developed in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/rust/config-layers`. The two read the same files and agree on:

- the `paths:` map, the `{name}` syntax, the error text for an unknown name, and the expansion of
  `~` and `~/…`;
- what counts as set (`valueIsSet` and `value_is_set`) and dotted-key lookup;
- how a YAML file is read: only `true` and `false` are booleans, a scalar key such as `1` is the
  string `"1"`, `.inf`, `-.inf` and `.nan` read as strings, a tag on a string or an integer is dropped with its
  value kept, `<<` is an ordinary key, and a collection or null key is an error (the table below
  lists the tags and numbers that differ);
- the message for an unmet need, down to "this command" when no command is named.

The crate has no zod to read, so a Rust tool lists its keys in a static `KeySpec` table and uses
`serde` types.

The two share one test fixture,
[`packages/rust/config-layers/tests/fixtures/parity.json`](https://github.com/osdlc/osdlc/blob/main/packages/rust/config-layers/tests/fixtures/parity.json).
This package's `tests/parity.test.ts` and the crate's `tests/parity.rs` read it. It covers
`valueIsSet`, `valueAt`, the YAML reading rules above, `resolveConfigPath` with a `home`,
`substitutePathNames` and its error text, and the unmet-need message. Behaviour the twins do not
share is left out of the fixture and listed in this table.

| | TypeScript | Rust |
|---|---|---|
| Shape of the config | zod schemas, in sections | `serde` types and a `KeySpec` table |
| Machine file `load()` | keeps the valid sections and reports what it dropped | gives `T::default()` for any problem; `read_strict` reports it |
| Project file | `assembleConfig` loads, validates and memoizes it, with a `.local` overlay deep-merged first | `read_mapping` reads it; `overlay_top_level` fills a missing or unset top-level key from the machine file, one level deep |
| Finding the project file | the caller passes the project root (`resolveConfigFile(projectRoot, ...)`); there is no `findUp` | `find_up(cwd, file_name)` |
| `substitutePathNames` | `substitutePathNames(value, names, where, { defineHint })`: one function, with the hint in an options object | `substitute_path_names(value, names, setting)` and `substitute_path_names_with_hint(value, names, setting, define_hint)` |
| Home for `~` | `home` option, default `$HOME`, else `os.homedir()` (unset or empty) | `home` argument, required |
| An empty home | `~/x` is left unexpanded and resolves as a relative path | `~/x` becomes `/x` |
| `1_000` and `0b11` | read as the strings `1_000` and `0b11` | read as the numbers 1000 and 3 |
| Integers beyond 2^53 | read as a number and lose precision | read as `u64`, then as a lossy float |
| Empty file | `readParsedFile` gives `null`; `readMappingFile` gives `{}` | `read_mapping` is an error ("found an empty document"); `load` treats it as an empty mapping |
| Looking up a list index (`list.0`) | `valueAt` finds the item | `value_at` gives `None` |
| `1e999` | read as the string `1e999` | read as the string `.inf` |
| `!!float 1` and an unknown tag such as `!custom 6` | the value reads as its text, a string | the value reads as a number |
| A `{` inside a name, as in `{a{dev}` | replaces `{dev}` and keeps the `{a` before it | an unknown path name `{a{dev}` |
| `~user/x` | not expanded; resolves as a relative path | rewritten to `<home>user/x`, which is wrong without a trailing slash on `home`; the crate should change |
| Dotted `paths:` resolution in a map | not provided | `resolve_paths_at` |
| Invalid config | `ConfigInvalidError`, exit code 14 | `FileProblem` |
| Platforms | Linux and macOS | Linux, macOS and Windows |

## How it compares

`conf` is a Node library that keeps one per-user config store in a JSON file; it has no project file.

`cosmiconfig`, `c12` and `rc` find config. They search several locations and
formats, merge layers, and hand back an object. This package does not search:
the tool names one file and the variable that relocates it, and the overlay
sits beside it. What it adds, as far as their documentation shows:

- Validation through a Zod schema with per-key metadata, where an invalid
  section is an error with a stable exit code (14).
- A machine file that never throws: it keeps the valid sections, reports what it
  dropped, migrates older versions, and writes atomically with a backup.
- Derived tooling: key explanations, span-preserving `config set|unset` edits,
  a commented scaffold file and a generated reference page.
- The "needs" check, which says where to set a missing key from what the schemas
  allow.

Pick `cosmiconfig` or `c12` when you must discover config in many places and
formats, or when you do not use Zod. Pick this package when you own one config
format and want the commands around it.

This comparison is from each project's public documentation and may be out of
date. Check their current documentation before you decide.

## Stability

The package is 0.x, so any minor release may break the API. Every export that this package defines
is experimental: its shape is still moving. Any release may change or remove an experimental export.
The re-exports from `@osdlc/tiered-dirs` (`TieredDirs`, `envVars` and their types) follow that
package.

The experimental exports:

`APPLY_PREFIX`, `AppliesVia`, `AssembleConfigOptions`, `CONFIG_INVALID_EXIT`, `CONSUMER_REF`,
`ConfigFileSpec`, `ConfigHandle`, `ConfigInvalidError`, `ConfigIssue`, `ConfigKeyMeta`,
`ConfigKeyMetaSchema`, `ConfigLayers`, `ConfigMetaIssue`, `ConfigNeed`, `ConfigNeeds`,
`ConfigNeedsOptions`, `ConfigOf`, `ConfigSection`, `ConfigSectionHooks`, `ConfigVocabulary`,
`ConfigVocabularySpec`, `ConsumerSchema`, `DeprecatedKeyUse`, `Deprecation`, `DeprecationSchema`,
`KeyScopes`, `LayerCheckContext`, `MACHINE_CONFIG_ISSUE_CODES`, `MachineConfigFile`,
`MachineConfigFileOptions`, `MachineConfigIssue`, `MachineConfigLoad`, `MachineMigrateResult`,
`MachineMigration`, `MessageOptions`, `MetOptions`, `MetaTerms`, `MetaValidator`, `NestedField`,
`PATH_NAME`, `PLANNED_PREFIX`, `ParsedFileRead`, `PathNameError`, `PathNames`, `PathsSchemaOptions`,
`RELOADS_ON_CHANGE`, `RawLayer`, `RawLayeredSteps`, `ReadMappingOptions`, `ReferenceOptions`,
`RegisteredKeyMeta`, `RegisteredKeyMetaSchema`, `ResolveConfigFileOptions`,
`ResolveConfigPathOptions`, `ResolveKeyPathOptions`, `ResolveLayeredStepsOptions`,
`ResolveLayeredValueOptions`, `ResolvedConfigFile`, `ResolvedKey`, `ResolvedLayeredSteps`,
`ResolvedLayeredValue`, `ResolvedStep`, `STABILITY_LEVELS`, `ScaffoldOptions`, `Stability`,
`StabilitySchema`, `StarterOptions`, `StepMode`, `StepProvenance`, `StrippedKeys`,
`SubstituteOptions`, `TermsOf`, `UnknownKeyUse`, `ValueLayer`, `VendorDirs`,
`applierAndReservedProblems`, `applierOf`, `assembleConfig`, `checkConfigMeta`, `closestMatches`,
`configNeeds`, `consumerProblems`, `currentMachineVersion`, `deepMergeConfig`, `defaultOf`,
`defineConfigSection`, `defineConfigVocabulary`, `deprecatedKeysSet`, `deprecationMessage`,
`describeShape`, `descriptionOf`, `didYouMean`, `enforcementProblems`, `envStem`, `getIn`,
`isReserved`, `jsonSchemaOf`, `keyDescription`, `keyExists`, `leafSchema`, `machineConfigFile`,
`machineLayerKeys`, `migrateMachineRaw`, `nestedFields`, `omitPath`, `overlayPath`, `pathMatcher`,
`pathNames`, `pathsSchema`, `projectLayerIssues`, `readConfigMeta`, `readMappingFile`,
`readParsedFile`, `renderReference`, `resolveConfigFile`, `resolveConfigPath`, `resolveKeyPath`,
`resolveLayeredSteps`, `resolveLayeredValue`, `scaffoldLocalYaml`, `scaffoldYaml`, `setPath`,
`splitKeyPath`, `starterYaml`, `stripUnknownKeys`, `substitutePathNames`, `systemDirs`,
`topLevelKeys`, `unknownKeyMessage`, `unsetPath`, `valueAt`, `valueIsSet`

A test compares this list with the `@experimental` tags in the source.

The meta model (`defineConfigVocabulary`, `checkConfigMeta`, `readConfigMeta`, the `*_PREFIX`
constants, `ConsumerSchema`, `StabilitySchema` and the test kit in `meta-kit.ts`) is experimental
like the rest. The consumer format it checks is `<path>.ts#<symbol>` for now.

`closestMatches` and `didYouMean` are close-match helpers. They have nothing to do with config.
They stay exported here and may move to a package of their own later.

## Platforms and runtimes

Linux and macOS for the 0.x line. Windows support is planned before 1.0. The
machine file path follows the platform's convention on macOS and XDG elsewhere,
and no test runs on Windows.

Node.js 22 or later, ESM only. The tests run on Vitest under Node.js 22 and 24, on Linux and
macOS. Bun is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
