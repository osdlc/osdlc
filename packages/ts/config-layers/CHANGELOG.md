# @osdlc/config-layers

## 0.7.1

### Patch Changes

- 910deca: `resolveConfigPath` no longer expands `~` from a relative `HOME`. A value such as `HOME=.` used to resolve `~/x` against the working directory, which can be the repository being read. A relative `HOME` now counts as unset, and the OS account's home is used. An explicit `home` option is used as given.
- Updated dependencies [910deca]
  - @osdlc/tiered-dirs@0.3.2

## 0.7.0

### Minor Changes

- 007d8ee: Importing `@osdlc/cli-tool` no longer loads yaml and zod. The root now takes its directory helpers from a new `@osdlc/config-layers/dirs` subpath, and `closestMatches` and `didYouMean` from a new `@osdlc/config-layers/did-you-mean` subpath. The root's exports are unchanged.
  
  `@osdlc/cli-tool` also adds the subpaths `./define-cli`, `./io`, `./prompt` and `./exit`, so a tool can import only the parts it uses.

## 0.6.1

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
  - @osdlc/etag-write@0.2.1
  - @osdlc/gfm-table@0.3.1
  - @osdlc/tiered-dirs@0.3.1
  - @osdlc/yaml-splice@0.2.1

## 0.6.0

### Minor Changes

- 857dc1d: The first release of `@osdlc/config-layers` on npm. A CLI tool's project and machine config files, and the check a command runs before it starts. It is the TypeScript twin of the Rust crate `config-layers`.
  
  - The package depends on `@osdlc/etag-write`, `@osdlc/gfm-table`, `@osdlc/tiered-dirs` and `@osdlc/yaml-splice`. `zod` `^4` is a peer dependency. ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.
  - Read like the Rust twin: YAML files read with only `true` and `false` as booleans, `.inf`, `-.inf` and `.nan` as strings, and a collection or null key as an error. `substitutePathNames` gives the same error text. The unmet-need message says "this command" when no command is named. `resolveConfigPath` and `pathNames` take an optional `home`; without it, `~` follows `$HOME`, else `os.homedir()`; an empty home leaves `~` unexpanded.
  - **Project config built from sections.** `defineConfigSection` (with `fileSchema` and `layerCheck`
    hooks) and `assembleConfig`, which turns a section list into a memoized loader. The overlay file
    is deep-merged over the committed file before validation (`deepMergeConfig`).
    `unknownTopLevel: 'reject' | 'ignore' | 'warn'` says what an unowned top-level key means. A bad
    file is a `ConfigInvalidError` with exit code 14 (`CONFIG_INVALID_EXIT`). `readParsedFile` and
    `readMappingFile` read a file's bytes.
  - **Where the file is.** `resolveConfigFile`: the tool names its file and the variable that
    relocates it; the overlay is `<stem>.local.<ext>`.
  - **Per-key metadata.** `meta.ts`, `defineConfigVocabulary` (the tool's own categories,
    appliers, layers, run contexts and enforcement levels) and a completeness kit
    (`consumerProblems`, `enforcementProblems`, `machineLayerKeys`, `applierAndReservedProblems`)
    for a tool's own tests. Secrets and deprecations are declared in the meta.
  - **Layered resolution.** `resolveLayeredSteps` and `resolveLayeredValue`: the env, local,
    project, default cascade, with the layer and mode each result came from.
  - **Tooling for a `config` command**, all derived from the schema: `resolveKeyPath`,
    `describeShape`, `defaultOf`, `jsonSchemaOf` and the other explain helpers; `setPath` and
    `unsetPath`, which edit a dotted key and keep comments; `scaffoldYaml`, `scaffoldLocalYaml`
    and `starterYaml`; `renderReference`, a markdown reference page.
  - **The machine file.** `machineConfigFile({ tool, schema, vendorDirs })` reads
    `<config>/<tool>/config.yaml` through the tool's schema. A missing, unreadable or invalid file
    degrades to the defaults, keeping valid sections and reporting every drop as a
    `MachineConfigIssue`. Migrations upgrade an older file in memory, `migrate()` writes the
    upgrade, and writes are atomic, checked against the schema and keep a `.bak`.
  - **Needs.** `configNeeds` answers whether a setting a command depends on is set in the project
    file, the machine file or a stand-in input, and renders one message saying where to set it.
  - **Named directories.** `pathsSchema`, `pathNames`, `substitutePathNames` (`{name}`),
    `PathNameError` and `resolveConfigPath`.
  - **Directory helpers and close matches.** `systemDirs`, `VendorDirs`, `TieredDirs`, `envVars`,
    and `closestMatches` and `didYouMean`.
  - TSDoc on every export, `@experimental` on every export this package defines, an `examples/`
    suite that uses every export through the package name, and tests that every export has an
    example and the README's experimental list matches the tags.
  - The README says what the package is for, when not to use it, how it compares, which exports
    are experimental, and which platforms it supports.
  - Aligned with the Rust crate `config-layers` 0.6.0. `tests/parity.test.ts` and the crate's `tests/parity.rs` read one shared fixture.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.2] - 2026-10-17 (unpublished)

#### Added

- The package is published under its own name. It was the `config` entry of a larger CLI
  package. `systemDirs`, `VendorDirs`, `TieredDirs`, `envVars`, `closestMatches` and `didYouMean`
  are exported from it.

### [0.2.1] - 2026-10-16 (unpublished)

#### Added

- Project config built from sections, `assembleConfig`, `resolveConfigFile`, `ConfigInvalidError`,
  `readParsedFile` and `readMappingFile`.
- `deepMergeConfig`, per-key metadata and its completeness kit, layered resolution with
  provenance, the explain helpers, `setPath` and `unsetPath`, the scaffold and reference renderers,
  and key deprecations.

### [0.2.0] - 2026-10-06 (unpublished)

#### Changed

- Breaking: `machineConfigFile` requires `vendorDirs`, the vendor and the override variables of
  the tool's config home. The option that resolved a shared config home is removed; pass `dirs`
  to inject the directories in tests.

### [0.1.2] - 2026-10-06 (unpublished)

#### Added

- Machine file writes and migrations: `write`, `check`, `migrate`, `loadWithIssues`,
  `currentVersion`, the `migrations` option, `MachineConfigIssue`, `MACHINE_CONFIG_ISSUE_CODES`,
  `migrateMachineRaw` and `currentMachineVersion`. Writes are atomic, checked against the schema,
  and keep a `.bak`.

#### Changed

- An invalid machine file keeps its valid sections and reports what it dropped, instead of
  falling back to the defaults whole. An unreadable file is reported apart from a YAML error.

### [0.1.1] - 2026-09-12 (unpublished)

#### Added

- Named directories: `pathsSchema`, `pathTokens`, `expandTokens`, `TokenError` and
  `resolveConfigPath`.

### [0.1.0] - 2026-09-12 (unpublished)

#### Added

- `machineConfigFile`, the machine file read through a schema, where a missing or invalid file
  gives the defaults and `<STEM>_MACHINE_CONFIG` moves it.
- `configNeeds`, the check a command runs before it starts.
- `valueAt`, `valueIsSet`, `leafSchema`, `keyExists`, `keyDescription`, `shapeOf`,
  `unwrapSchema` and `envStem`.
