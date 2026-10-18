---
"@osdlc/tiered-dirs": minor
---

First public release. Machine-local directories for one vendor's products, addressed on two axes:
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
