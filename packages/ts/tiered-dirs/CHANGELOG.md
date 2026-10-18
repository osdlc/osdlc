# Changelog

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.0] - 2026-10-17 (unpublished)

#### Added

- A `state` home: `state` in `Home` and `HOMES`, `Tier.state()`, `<P>_STATE_DIR` and
  `<root>/state`. It is the XDG state home on Linux and Application Support on macOS. On Windows
  it is `%LOCALAPPDATA%\state`, beside each tier's cache folder, never the same folder.
- Conventions: `native` (the default) or `xdg`, through `systemBaseDirs(vars, { convention })`
  and `TieredDirs.fromEnv(vendor, vars, { convention })`, with `Convention` and `CONVENTIONS`.
  `xdg` gives the XDG paths on macOS too; Linux is the same under both, and on Windows `xdg`
  means `native`. A relative `XDG_*` value is ignored and `~` is not expanded.
- `xdgBaseDirs(home, env)` builds the XDG table under any home.
- `<P>_CONVENTION=native|xdg` overrides the caller's convention; any other value throws
  `TieredDirsError`.

#### Changed

- Breaking: `Home` and `HOMES` gain `state`. An exhaustive `switch` over `Home` must handle it.
- Breaking: `EnvVars` has `state` and `convention` names, and `BaseDirs` has a `state` root. An
  object built by hand needs them; build `EnvVars` with `envVars()`.
- Breaking: `state`, `logs` and `run` are reserved segment names, refused in any case, so no tier
  lands on another home's root. `suite`, `standalone`, `Dir.scoped`, `Dir.app` and
  `isValidSegment` refuse them.

### [0.1.0] - 2026-10-06 (unpublished)

#### Added

- `TieredDirs`, `Tier` and `Dir`: directories addressed by tier (`vendor()`, `suite(key)`,
  `standalone(tool)`) and home (`durable`, `config`, `cache`, `logs`, `runtime`), plus an
  untiered `scratch()` root. Every builder returns a new value, and every caller-supplied segment
  is checked to be one safe path segment.
- `systemBaseDirs` and `TieredDirs.fromEnv`: the per-OS table resolved once, with logs in
  `~/Library/Logs` on macOS and runtime under the durable home where the platform has none. Every
  input is injectable: the platform, the environment, the home directory and single roots.
- Override variables under a caller-chosen prefix (`envVars`, `overrideVars`), and
  `rootedBaseDirs` for the layout `<P>_ROOT` selects.
- Test isolation: in a test runner process with `<P>_ROOT` unset, the root reads as a scratch
  directory unique to the process, and `<P>_REQUIRE_OVERRIDE` turns a fallback to the real home
  into an error.
- `TieredDirsError`, `isValidSegment`, `HOMES` and `TIER_KINDS`.
