# `@osdlc/config-layers`

A CLI tool's two config files, the sections its project file is built from,
and the check a command runs before it starts.

A tool that runs inside a project has a committed config file there. It often
has a second file for settings that only mean something on one machine. Both
are read through a Zod schema. A local overlay can override the committed file.
A command that cannot run without a setting should give one clear message when
the setting is missing. This package provides:

- project config built from sections, with a memoized loader;
- a machine file loader that never throws, with migrations;
- a `paths:` map of named directories;
- the "needs" check.

It also has the functions a `config` command is built from: key explanations,
edits that keep comments, a scaffold file and a markdown reference page. All
of them are derived from the schema.

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
like `~/Developer` only means something on one laptop, so it does not belong in
a committed file. The tool needs a second file that stays on the machine.
Without a shared check, every command that cannot run without a setting checks
for it by hand, with its own wording and exit code. Nothing lists which
settings a command depends on.

This package handles those three things in one place: the machine file's
location and loader, the lookup across two schemas, and the message for an
unmet need.

## The machine file

`machineConfigFile({ tool, schema, vendorDirs })` describes the file
`<config>/<tool>/config.yaml` in the tool's standalone config home
([`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs):
`~/Library/Application Support` on macOS, `${XDG_CONFIG_HOME:-~/.config}` elsewhere).
`vendorDirs` is `{ vendor, envVars }`: the vendor and the override variables (`<PREFIX>_ROOT`,
`<PREFIX>_CONFIG_DIR`) that move the config home. Whoever ships the tool supplies them.

| Member | Does |
|---|---|
| `path()` | the file's path. `<STEM>_MACHINE_CONFIG` (`TOOLY_MACHINE_CONFIG`) overrides it |
| `load()` | the file parsed through `schema`, all defaults filled. Never throws |
| `loadWithIssues()` | `{ value, issues }`: `load()`'s value plus one issue per thing it dropped |
| `clearCache()` | drop the memoised value (tests) |
| `check(raw)` | the load issues `raw` would have that the file on disk does not |
| `write(text)` | replace the file atomically and keep the old one as `<file>.bak`. Throws, writing nothing, if `text` is not a mapping or `check` finds a new issue |
| `migrate({ dryRun? })` | run the migrations on the file and return `{ path, from, to, applied, written }`. Writes only when a step applied |
| `currentVersion` | the last migration's `to`, or 1 |
| `env` | the override variable's name |

Every key in the schema must have a default. `schema.parse({})` is then the all-defaults object,
which the loader returns for a missing, unreadable or non-mapping file. When a file fails the
schema, the loader keeps what it can. It drops each unknown key, then gives each section that is
still invalid its default, and keeps the rest. Every drop is a `MachineConfigIssue` with a `path`,
a `code` and a `message`. The code is `unknown_key`, `invalid`, `unreadable`, `yaml`,
`not_mapping` or `newer_version`. An unknown key is found only when every object in the schema is
`.strict()`; a plain `z.object` drops it silently, with no issue. The loader never prints issues. The tool decides how to show
them. Options `env`, `fileName` and `dirs` change the variable, the file name and how the
directories are resolved (a test passes a rooted one).

Option `migrations` is an ordered `MachineMigration[]` (`{ from, to, run(raw) }`). The schema should
declare an optional integer `version`. A file without one is version 1. The loader runs every step
from the file's version on, in memory, before validation. A file newer than the last step is read
as-is with a `newer_version` issue. `migrate()` saves the result through `write`. The rewrite
drops the file's comments, and the `.bak` keeps them. `migrateMachineRaw` is exported on its own.
The atomic write uses `@osdlc/etag-write`.

The library ships no machine schema. `pathsSchema` and `substitutePathNames` (`paths.ts`) handle
the `paths:` map that a tool's machine and project schemas can share.

## Needs

A command declares the settings it cannot run without, as needs.

A need is `{ config, unlessInput? }`. `config` is a dotted key such as `upload.endpoint` or
`paths.dev`. `unlessInput` names an input that can be given instead: `endpoint` for `--endpoint`.

`configNeeds({ tool, projectFile, projectSchema, machine, scaffoldHint? })`
returns:

| Member | Does |
|---|---|
| `met(need, { project, input })` | true when the input is given, or the key is set in the project config or the machine file |
| `message(need, { projectRoot, command })` | the message for an unmet need |
| `whereToSet(key, projectRoot)` | the "set it in ..." clause on its own |
| `keyScopes(key)` | which schemas carry the key: `{ project, machine }` |
| `keyExists(key)` | either does |
| `keyDescription(key)` | the first sentence of the key's `.describe()` prose, project schema first |

"Set" means not undefined, null, empty text, an empty list or an empty map,
so a schema default like `repos: []` still counts as unset.

The message says where to set the key. It goes by which schemas carry the key
and whether a project file exists at `projectRoot`. A key only the project
schema carries names the project file. A key only the machine schema carries
names the machine file by path. A key both carry names both. The project file
comes first when one exists at `projectRoot`. Otherwise the machine file comes
first, and the project file is described ("a tooly.yaml at the project root
(none above /here)") instead of given as a path.

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
| `pathsSchema({ reserved })` | the map as a schema: a name (letters, digits, `_`, starting with a letter) → a directory. Refuses any `reserved` name, which a consuming setting defines itself |
| `pathNames(baseDir, machine, project, opts?)` | the effective map: machine entries over project ones, each `~`-expanded and absolute. `opts.home` is what `~` expands to |
| `substitutePathNames(value, names, where, opts?)` | `value` with every `{name}` replaced. Throws `PathNameError` for a name nothing defines. The message names `where` it appeared, what is available, and `opts.defineHint` |
| `resolveConfigPath(value, baseDir, opts?)` | the `~` and relative-path expansion every config path value goes through. `opts.home` defaults to `$HOME` (`%USERPROFILE%` on Windows), or the OS account's home when that is unset, empty or relative. An empty home leaves `~` unexpanded. Only `~` and `~/…` expand |

An unknown path name is an error, not an empty string. A setting that quietly
becomes `/repo` instead of `/Users/me/dev/repo` fails somewhere far from the
typo.

## Pieces

`valueAt(obj, key)`, `getIn(value, path)`, `valueIsSet(value)`, `leafSchema(schema, key)`,
`keyExists(schema, key)`, `keyDescription(schema, key)` and `envStem(tool)` are exported for a
tool that needs one of them without the rest. `valueAt` and `getIn` walk own keys of plain
mappings only: a list index or an inherited name such as `constructor` is not found. `leafSchema`
walks a Zod object by dotted key, the same walk `resolveKeyPath` makes. It peels every wrapper
(`optional`, `default`, `catch`, `readonly`, a pipe's input side and the rest) but returns the
outermost one, since that is where `.describe()` sits. A key under a record resolves to the record
itself, provided the rest of the key resolves in the record's value type.

`systemDirs` and the `VendorDirs` type resolve a tool's machine-local directories over `TieredDirs`
and `envVars`, which are re-exported from `@osdlc/tiered-dirs`. `closestMatches` and `didYouMean`
suggest close names for a mistyped noun, verb, key or repo. Both groups are also
exported from the light subpaths `@osdlc/config-layers/dirs` and
`@osdlc/config-layers/did-you-mean`, which load neither yaml nor zod.

The schema walk reads Zod's private `_def` layout by tag name, not with
`instanceof`, so a second copy of zod in a consumer's dependency tree still
works. A test fails if a zod release changes that layout, and
`tests/zod-copy.test.ts` loads a config through a second copy of zod.

## Sections and the loader

The project file is built from sections, one per top-level key. A section is
made by `defineConfigSection({ key, schema, meta, fileSchema?, layerCheck? })`:

- `schema` carries the key's `.describe()` prose.
- `meta` is the per-key metadata (`category`, `consumers`, `layers`,
  `applies_via`, `enforcement`, `runs_in`; see `meta.ts`). It is registered as
  the last call on the schema chain.
- `fileSchema` is the schema for validating one file alone. Some sections check
  across fields that a project may split between the two files. Such a section
  supplies its un-refined variant here.
- `layerCheck` receives the raw per-layer values and the parsed merged value,
  for rules that need to know which layer set a value.

The tool picks the words that fill `meta`. `defineConfigVocabulary({ categories, appliers,
layers, runContexts, enforcement: { levels, reserved?, applied? } })` (`vocabulary.ts`)
returns the enum schemas for them, a `defineSection` that type-checks a section's meta
against them, and `checkMeta`/`readMeta`. `layers` must include the three the library
reads itself (`project`, `local`, `machine`) and may add more. A section defined with the
plain `defineConfigSection` carries plain strings. `checkConfigMeta(shape)` with no
vocabulary checks only their structure.

`assembleConfig({ file, sections, unknownTopLevel, label?, parseProblem?,
crossFieldIssues? })` builds a handle from the sections a tool mounts:

| Member | Does |
|---|---|
| `schema` / `fileSchema` | the schema over every mounted section (strict unless `unknownTopLevel` is `'ignore'`), and the same schema for validating one file alone |
| `load(root)` | the project file with the overlay deep-merged over it before validation, validated once, memoized per resolved file. Reloads when either file's stat signature changes |
| `loadLayers(root)` | `load`, plus the two raw layers and the resolved `files` |
| `readLayers(root)` | the raw layers without validating, for diagnostics of a broken file |
| `clearCache()` | drop the memo (tests) |

`unknownTopLevel` says what happens to a top-level key that no mounted section owns:

- `'warn'` (a tool that mounts every section) removes an unknown key at any depth from the parsed
  copy and reports it. The report is `loadLayers(root).unknownKeys`, one `{ file, path }` per key,
  and one stderr line per file and key per handle. The file on disk is never rewritten, so a newer
  tool's key does not break an older tool. Option `strictAt` lists objects, such as matchers, that
  still fail on an unknown key.
- `'reject'` fails the file on an unknown top-level key.
- `'ignore'` (a standalone tool that mounts a few sections) drops the key unparsed, however
  malformed, with no warning.

In every mode, a mounted section that is present but invalid is a `ConfigInvalidError`, exit
`CONFIG_INVALID_EXIT` (14). So is a file that is unreadable, not YAML or not a mapping. Under
`'reject'` and `'ignore'`, a nested unknown key is one too. `stripUnknownKeys` does the drop, and
the machine config's salvage uses it as well. A file that does not exist is not an error. With
neither file present, the result is the all-defaults object.

`readParsedFile(path, 'yaml' | 'json')` reads one config file and returns absent, unreadable,
unparsable or the parsed value. Every project file read goes through it, and the machine file is
parsed by the same rules. `readMappingFile` is its mapping-only layer.

## Where the file is

`resolveConfigFile(projectRoot, { name, envVar })` is the only function that finds the
file. It returns `{ project, local, source: 'env' | 'default' }`. The tool names the file
and the variable. There is no default. With `{ name: 'tooly.yaml', envVar: 'TOOLY_CONFIG' }`
the pair is `<root>/tooly.yaml` and `<root>/tooly.local.yaml`. While `TOOLY_CONFIG` is set, it
replaces that pair with the file it names and that file's overlay. Neither root file is read.

- A relative path resolves against the process working directory at startup. Every caller
  prints the absolute path.
- The overlay is `<dir>/<basename without its last extension>.local.<ext>`. `tools/tooly.yaml`
  pairs with `tools/tooly.local.yaml`, `cfg.yml` with `cfg.local.yml`.
- A set variable that names a missing file is a `ConfigInvalidError`. An absent default file is not.
- `scope: 'subtree'` resolves a directory beneath the root (a per-directory overlay file) to its own
  default pair, since the variable names the root file only.
- The variable does not affect the machine file (`<STEM>_MACHINE_CONFIG`).

The package does not search upward for the project root. The caller passes it. The Rust crate has
`find_up` for that. See the table in "The Rust crate".

This package has no repository-trust check. A tool that has one should treat a file named by the
variable as project-sourced, exactly like the default file, so pointing the variable outside the
repository does not get around it.

## Meta, provenance, explain, edit, scaffold, reference

The functions a `config` command is built from. None of them names a tool.

| Module | Exports |
|---|---|
| `meta.ts`, `vocabulary.ts`, `meta-kit.ts` | the meta structure, `defineConfigVocabulary`, and `checkConfigMeta`/`readConfigMeta`. Also the test helpers a tool's meta test calls (`consumerProblems`, `enforcementProblems`, `machineLayerKeys`, `applierAndReservedProblems`), each returning its problems |
| `provenance.ts` | `resolveLayeredSteps`/`resolveLayeredValue`: resolve a setting through the env (steps only), local, project and default layers, and record which layer each part came from as `{layer, mode}` (`ValueLayer`, `StepProvenance`) |
| `explain.ts` | `resolveKeyPath`, `splitKeyPath`, `describeShape`, `defaultOf`, `nestedFields`, `jsonSchemaOf`, `omitPath` over a schema shape |
| `edit.ts` | `setPath`/`unsetPath`: dotted-path edits that keep every byte outside the edited value, built on `@osdlc/yaml-splice` |
| `scaffold.ts` | `scaffoldYaml`, `scaffoldLocalYaml`, `starterYaml`: an annotated file derived from the schema (the starter groups keys in the caller's category order) |
| `reference.ts` | `renderReference`: a markdown reference page from the schema and its meta, grouped in the caller's category order |
| `merge.ts` | `deepMergeConfig`: mappings merge per key, arrays and scalars replace. The exception is a top-level `schedules:` list, which merges by entry `name` |

## Runtime

`node:` APIs only. Dependencies: `@osdlc/tiered-dirs`,
`@osdlc/etag-write`, `@osdlc/gfm-table`, `@osdlc/yaml-splice`, `yaml`. Peer dependency: `zod` `^4`.

## The Rust crate

The Rust crate [`config-layers`](https://crates.io/crates/config-layers) matches this
package. It is developed in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/rust/config-layers`. The two read the same files and agree on:

- the `paths:` map, the `{name}` syntax, the error text for an unknown name, and the expansion of
  `~` and `~/…`;
- what counts as set (`valueIsSet` and `value_is_set`) and dotted-key lookup;
- how a YAML file is read (the table below lists the tags and numbers that differ):
  - only `true` and `false` are booleans;
  - a scalar key such as `1` is the string `"1"`;
  - `.inf`, `-.inf` and `.nan` read as strings;
  - a tag on a string or an integer is dropped and its value kept;
  - `<<` is an ordinary key;
  - a collection or null key is an error;
- the message for an unmet need, down to "this command" when no command is named.

The crate has no zod to read, so a Rust tool lists its keys in a static `KeySpec` table and uses
`serde` types.

The two share one test fixture,
[`packages/rust/config-layers/tests/fixtures/parity.json`](https://github.com/osdlc/osdlc/blob/main/packages/rust/config-layers/tests/fixtures/parity.json).
This package's `tests/parity.test.ts` and the crate's `tests/parity.rs` read it. It covers
`valueIsSet`, `valueAt`, the YAML reading rules above, `resolveConfigPath` with a `home`
(including `~user/x`, an empty home and a relative one), `substitutePathNames` and its error text,
and the unmet-need message. Behaviour the two do not share is left out of the fixture and listed in
this table.

| | TypeScript | Rust |
|---|---|---|
| Shape of the config | zod schemas, in sections | `serde` types and a `KeySpec` table |
| Machine file `load()` | keeps the valid sections and reports what it dropped | gives `T::default()` for any problem; `read_strict` reports it |
| Project file | `assembleConfig` loads, validates and memoizes it, with a `.local` overlay deep-merged first | `read_mapping` reads it; `overlay_top_level` fills a missing or unset top-level key from the machine file, one level deep |
| Finding the project file | the caller passes the project root (`resolveConfigFile(projectRoot, ...)`); there is no `findUp` | `find_up(cwd, file_name)` |
| `substitutePathNames` | `substitutePathNames(value, names, where, { defineHint })`: one function, with the hint in an options object | `substitute_path_names(value, names, setting)` and `substitute_path_names_with_hint(value, names, setting, define_hint)` |
| Home for `~` | `home` option, default `$HOME` (`%USERPROFILE%` on Windows), else the OS account's home (unset, empty or relative) | `home` argument, required; the crate never reads `$HOME` |
| `1_000` and `0b11` | read as the strings `1_000` and `0b11` | read as the numbers 1000 and 3 |
| Integers beyond 2^53 | read as a number and lose precision | read as `u64`, then as a lossy float |
| Empty file | `readParsedFile` gives `null`; `readMappingFile` gives `{}` | `read_mapping` is an error ("found an empty document"); `load` treats it as an empty mapping |
| `1e999` | read as the string `1e999` | read as the string `.inf` |
| `!!float 1` and an unknown tag such as `!custom 6` | the value reads as its text, a string | the value reads as a number |
| A `{` inside a name, as in `{a{dev}` | replaces `{dev}` and keeps the `{a` before it | an unknown path name `{a{dev}` |
| Dotted `paths:` resolution in a map | not provided | `resolve_paths_at` |
| Invalid config | `ConfigInvalidError`, exit code 14 | `FileProblem` |
| Platforms | Linux and macOS | Linux, macOS and Windows |

## How it compares

`conf` is a Node library that keeps one per-user config store in a JSON file. It has no project file.

`cosmiconfig`, `c12` and `rc` find config. They search several locations and
formats, merge layers, and hand back an object. This package does not search.
The tool names one file and the variable that relocates it, and the overlay
sits beside it. What this package adds, as far as their documentation shows:

- Validation through a Zod schema with per-key metadata, where an invalid
  section is an error with a stable exit code (14).
- A machine file that never throws: it keeps the valid sections, reports what it
  dropped, migrates older versions, and writes atomically with a backup.
- Functions derived from the schema: key explanations, `config set|unset`
  edits that keep comments, a commented scaffold file and a generated
  reference page.
- The "needs" check, which says where to set a missing key from what the schemas
  allow.

Pick `cosmiconfig` or `c12` when you must discover config in many places and
formats, or when you do not use Zod. Pick this package when you own one config
format and want the commands around it.

This comparison is from each project's public documentation and may be out of
date. Check their current documentation before you decide.

## Stability

The package is 0.x, so any minor release may break the API. Every export that this package defines
is experimental: its shape may still change. Any release may change or remove an experimental export.
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
