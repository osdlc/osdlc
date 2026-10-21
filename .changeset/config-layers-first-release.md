---
"@osdlc/config-layers": minor
---

The first release of `@osdlc/config-layers` on npm. A CLI tool's project and machine config files, and the check a command runs before it starts. It is the TypeScript twin of the Rust crate `config-layers`.

- The package depends on `@osdlc/etag-write`, `@osdlc/gfm-table`, `@osdlc/tiered-dirs` and `@osdlc/yaml-splice`. `zod` `^4` is a peer dependency. ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.
- Read like the Rust twin: YAML files read with only `true` and `false` as booleans, `.inf`, `-.inf` and `.nan` as strings, and a collection or null key as an error. `substitutePathNames` gives the same error text. The unmet-need message says "this command" when no command is named. `resolveConfigPath` and `pathNames` take an optional `home`; without it, `~` follows `$HOME`, else `os.homedir()`.
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
