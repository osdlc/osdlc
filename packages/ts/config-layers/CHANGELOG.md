# Changelog

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
