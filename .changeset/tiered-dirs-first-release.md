---
"@osdlc/tiered-dirs": minor
---

First public release. Machine-local directories for one vendor's products, addressed on two axes:
the tier says who shares the state (the vendor, a suite of products, or one standalone tool), and
the home says how durable it is (durable, config, cache, state, logs, runtime). The homes come
from a per-OS table with native or XDG paths, every root can be moved by an override variable,
and tests run under a scratch root instead of the real home.

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
  ones that move a directory.
- Conventions: `native` (the default) or `xdg`, chosen by the caller or by `<P>_CONVENTION`.
- `isValidSegment(key)`, the rule every caller-supplied segment must pass. `state`, `logs` and
  `run` are reserved.
- `TieredDirsError`, the one error class the package throws.
- The types `BaseDirs`, `EnvVars`, `Home`, `Convention`, `TierKind` and `SystemBaseDirsOptions`,
  and the lists `HOMES`, `CONVENTIONS` and `TIER_KINDS`.
- The test-root rule recognises a Vitest worker (`VITEST_WORKER_ID` or `VITEST_POOL_ID` set, and
  the entry point in the `vitest` package's `dist/workers` folder), as well as `NODE_ENV=test`,
  `node --test` and Bun. A child process a test spawns still gets no default.

Changes:

- Aligned with the Rust crate tiered-dirs 0.3.0.
