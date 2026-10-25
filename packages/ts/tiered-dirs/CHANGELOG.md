# @osdlc/tiered-dirs

## 0.4.0

### Minor Changes

- 9616994: New `ResolveOptions.conventionFromEnv`. Pass `false` to pin `convention`, so `<P>_CONVENTION` cannot override it. Use it for a file another program reads at a fixed path, such as a shell launcher that reads `~/.config/<tool>`. The default, `true`, keeps today's behaviour.

## 0.3.2

### Patch Changes

- 910deca: A relative `HOME` (`USERPROFILE` on Windows) now counts as unset. Every home built on it used to land under the working directory, so a `.env` loader that set `HOME=.` put config, state and cache inside whatever directory the tool ran in. The OS account's home (`os.userInfo().homedir`) is used instead, or, with an injected `env`, `MISSING_BASE_DIR` is thrown. The Rust crate treats a relative `HOME` as unset too, but has no account-home fallback.

## 0.3.1

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.3.0

### Minor Changes

- 93ca515: First public release. Machine-local directories for one vendor's products, addressed on two axes:
  the tier says who shares the state (the vendor, a suite of products, or one standalone tool), and
  the home says how durable it is (durable, config, cache, state, logs, runtime). The homes come
  from a per-OS table with native or XDG paths, every root can be moved by an override variable,
  and a test runner process gets a scratch root instead of the real home unless `<P>_ROOT` is set
  or `HOME` was moved off the passwd home (see the README for the rules).
  
  The additions:
  
  - `TieredDirs`, with `vendor()`, `suite(key)` and `standalone(tool)`, which return a `Tier`. A
    `Tier` gives a `Dir` for each home: `durable()`, `config()`, `cache()`, `state()`, `logs()`,
    `runtime()`, or `home(name)`. `Dir.scoped(kind, key)` and `Dir.app(app)` narrow a directory.
    `TieredDirs.scratch()` gives the platform temp directory, outside both axes.
  - `TieredDirs.fromEnv(vendor, vars, opts)` and `systemBaseDirs(vars, opts)` resolve the base
    directories from the environment once. `rootedBaseDirs(root)` lays every root out under one
    directory, and `xdgBaseDirs(home, env)` builds the XDG table under any home.
  - `envVars(prefix)` names the override variables: `<P>_ROOT`, `<P>_<HOME>_DIR`,
    `<P>_SCRATCH_DIR`, `<P>_REQUIRE_OVERRIDE` and `<P>_CONVENTION`. `overrideVars(vars)` lists the
    ones that move a directory. `isOverridden(vars, env)` says whether any of them is set to a
    non-empty value.
  - Conventions: `native` (the default) or `xdg`, chosen by the caller or by `<P>_CONVENTION`.
    `parseConvention(value)` parses one exactly, untrimmed.
  - `isValidSegment(key)`, the rule every caller-supplied segment must pass. `state`, `logs` and
    `run` are reserved.
  - `isVendorBundleId(vendor, bundleId)`, the check `TieredDirs.isVendorBundleId` makes, for a
    caller with no `TieredDirs`.
  - `TieredDirsError`, the one error class the package throws. Its `code` is one of
    `MISSING_BASE_DIR`, `RELATIVE_OVERRIDE`, `OVERRIDE_REQUIRED`, `INVALID_CONVENTION` and
    `INVALID_KEY`.
  - `ResolveOptions`, the options of `systemBaseDirs` and `TieredDirs.fromEnv`. `testRoot: false`
    skips the test-root default; `<P>_ROOT` and `<P>_REQUIRE_OVERRIDE` still apply.
  - `testRoot()`, the per-process scratch root in a test runner process, else `undefined`.
  - The types `BaseDirs`, `EnvVars`, `Home`, `Convention`, `TierKind`, `ResolveOptions` and
    `TieredDirsErrorCode`, and the lists `HOMES`, `CONVENTIONS` and `TIER_KINDS`. A minor release
    may add a member to `TierKind`, `Convention` or `TieredDirsErrorCode`, or a name to `EnvVars`.
  - The test-root rule recognises a Vitest worker (`VITEST_WORKER_ID` or `VITEST_POOL_ID` set, and
    the entry point in the `vitest` package's `dist/workers` folder, or tinypool's
    `dist/entry/process.js` or `dist/entry/worker.js` on Vitest 3 and earlier), as well as `NODE_ENV=test`,
    `node --test` and Bun. A child process a test spawns still gets no default.
  
  Changes:
  
  - `Dir` and `Tier` are exported as types only. A caller gets a value from the checked methods
    (`TieredDirs.vendor()`, `suite()`, `standalone()`, `scratch()`, `Tier.home()` and `Dir.scoped()`
    or `app()`), never from a constructor.
  - Every `BaseDirs` field is `readonly`.
  - Aligned with the Rust crate tiered-dirs 0.3.0.

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
