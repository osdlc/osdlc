# @osdlc/tiered-dirs

Machine-local directories for every product a vendor ships, on Linux, macOS
and Windows.

## The problem

A program that keeps state on disk needs a directory for it, and the right one
differs by operating system and by kind of state. A vendor that ships several
programs also has to decide which state they share and which they keep apart.
And a test suite must never write into the developer's real home directory.

`@osdlc/tiered-dirs` answers all three. A caller names a directory on two axes:

- **tier**: who shares the state. `vendor()` is `<vendor>`, shared by
  everything the vendor ships. `suite(key)` is `<vendor>.<key>`, shared by the
  programs of one suite. `standalone(tool)` is the bare `<tool>`, for a general
  tool that is not part of the vendor's suite.
- **home**: how long the state must last. `durable`, `config`, `cache`,
  `state`, `logs` or `runtime`.

`scratch()` is on neither axis. It is the platform temp directory.

A **convention** picks the per-OS table the homes come from: `native` (the
default) or `xdg`. They differ on macOS only.

It is for a vendor with more than one program, or one program with tests that
must not touch the real home. It computes paths only: it creates, reads and
deletes nothing on disk. It has no dependencies. The
[Rust crate `tiered-dirs`](https://crates.io/crates/tiered-dirs) gives the same
relative paths.

## When not to use it

- One program with one config file. `env-paths` or `xdg-app-paths` is enough.
- You want the app framework's own directories, for example Tauri's. Use the
  framework's.
- You need the directories created. This package does not create them.

## How it compares

| Package | What it gives |
|---|---|
| [env-paths](https://github.com/sindresorhus/env-paths) | One tool's data, config, cache, log and temp directories per OS. |
| [xdg-basedir](https://github.com/sindresorhus/xdg-basedir) | The XDG variables and their defaults, with no app name. |
| [xdg-app-paths](https://github.com/rivy/js.xdg-app-paths) | One tool's XDG directories, with a legacy fallback. |
| [os-paths](https://github.com/rivy/js.os-paths) | The OS home, temp and XDG directories. |
| [appdirsjs](https://github.com/codingjerk/appdirs-js) | One tool's cache, config and data directories. |

They give per-app or XDG directories for one tool. None of them has shared
vendor and suite tiers, separate state and runtime homes that are never the
cache, one override variable per root, a scratch root for tests, or a Rust
crate tested against the same paths.

## Install

```sh
npm install @osdlc/tiered-dirs
```

`pnpm add @osdlc/tiered-dirs` and `yarn add @osdlc/tiered-dirs` work too.

## Quick start

```ts
import { TieredDirs, envVars } from '@osdlc/tiered-dirs'

const dirs = TieredDirs.fromEnv('com.example', envVars('EXAMPLE'), {
  platform: 'linux',
  env: { HOME: '/home/ada' },
})

dirs.vendor().config().path
// /home/ada/.config/com.example

dirs.suite('notes').cache().scoped('vaults', 'v7').app('search').path
// /home/ada/.cache/com.example.notes/vaults/v7/search
```

A real program leaves out `platform` and `env`. They are there so the paths
above do not depend on the machine. `examples/usage.test.ts` runs every export
of this package.

## Tiers

| tier | segment | shared by |
|---|---|---|
| vendor | `<vendor>` | every product line the vendor ships |
| suite | `<vendor>.<suiteKey>` | the products that share user data |
| standalone | `<tool>` | one general tool, shipped outside the suite |

The vendor is the one segment the caller fixes up front. The suite segment is
composed from it. `suiteKey` is a caller-supplied constant, not derived from a
bundle identifier. `Tier.kind` reports which method produced a tier (`vendor`,
`suite` or `standalone`).

`Tier` and `Dir` are exported as types only. Their constructors are not part
of the package, so a value always comes from a checked method:
`TieredDirs.vendor()`, `suite()`, `standalone()` and `scratch()`, `Tier.home()`
and the home methods, and `Dir.scoped()` and `Dir.app()`.

The product tier, one product's own directory keyed by bundle identifier, is
not here. An app framework usually resolves it, and this package takes no
framework dependency. `TieredDirs.isVendorBundleId(bundleId)` lets a layer
above check that a product's bundle id sits under the vendor.
`isVendorBundleId(vendor, bundleId)` is the same check for a caller with no
`TieredDirs`. Both are a bare prefix test, as in the Rust crate.

Tiers are distinct addresses and there is no merge. `vendor().durable()`,
`suite(k).durable()` and `standalone(t).durable()` are different locations.
This package never reads two and merges them. A given piece of state lives at
exactly one tier and the caller names the tier it means.

### A general tool supplies its own root

The vendor and suite tiers are for a suite: products that share one owner. A
general tool the vendor ships into other people's repositories is not in that
suite. `suite('tool')` would create a vendor-named directory on the machine of
someone who does not use the suite.

`standalone(tool)` is the tier for that tool. Its segment is the bare tool
name, with no vendor composition. Its config directory is `~/.config/<tool>` on
Linux, and on macOS under `xdg`. Under `native` on macOS it is
`~/Library/Application Support/<tool>`.

```ts
import { TieredDirs, envVars } from '@osdlc/tiered-dirs'

const cli = TieredDirs.fromEnv('com.example', envVars('TOOL'), {
  convention: 'xdg',
  platform: 'darwin',
  env: { HOME: '/Users/ada' },
})
cli.standalone('tool').config().path
// /Users/ada/.config/tool
```

## Homes

| home | Linux (both) | macOS, `native` | macOS, `xdg` | Windows (both) |
|---|---|---|---|---|
| durable | `$XDG_DATA_HOME`, `~/.local/share` | `~/Library/Application Support` | `$XDG_DATA_HOME`, `~/.local/share` | `%APPDATA%` |
| config | `$XDG_CONFIG_HOME`, `~/.config` | `~/Library/Application Support` | `$XDG_CONFIG_HOME`, `~/.config` | `%APPDATA%` |
| cache | `$XDG_CACHE_HOME`, `~/.cache` | `~/Library/Caches` | `$XDG_CACHE_HOME`, `~/.cache` | `%LOCALAPPDATA%` |
| state | `$XDG_STATE_HOME`, `~/.local/state` | `~/Library/Application Support` | `$XDG_STATE_HOME`, `~/.local/state` | `%LOCALAPPDATA%\state` |
| logs | `$XDG_STATE_HOME`, `~/.local/state` | `~/Library/Logs` | `$XDG_STATE_HOME`, `~/.local/state` | `<durable>/logs` |
| runtime | `$XDG_RUNTIME_DIR`, `<durable>/run` | `<durable>/run` | `$XDG_RUNTIME_DIR`, `<durable>/run` | `<durable>/run` |

`logs` and `state` never fall back to `cache`, because the OS purges cache. On
Windows `state` is `%LOCALAPPDATA%\state`. That is under the same root as each
tier's cache folder and beside it, never the same folder. `state`, `logs` and
`run` are reserved segment names in any letter case, so no tier can land on
another home's root. `standalone('state')` throws `TieredDirsError`. `runtime`
is under `durable`, not `cache`, for the same reason: the OS may purge cache
while the process a pidfile describes is still alive. Under XDG, logs and
state share one directory, so keep their file names apart. A relative `XDG_*` value is
ignored, as the XDG spec says, and `~` is not expanded. On Windows, `xdg`
means `native`. `~` is `HOME` (`USERPROFILE` on Windows). A relative value
counts as unset, so a path built on it never lands in the working directory:
the OS account's home is used, or, with an injected `env`,
`MISSING_BASE_DIR` is thrown.

## Choosing a convention

- A CLI or developer tool uses `xdg`. Its users look for `~/.config/<tool>` and
  keep it in their dotfiles.
- A GUI app uses `native`. macOS users and tools expect
  `~/Library/Application Support`.
- A file that two programs read is resolved in one place, by the program that
  owns it, under that program's convention.

Pass `{ convention: 'xdg' }` to `systemBaseDirs` or `TieredDirs.fromEnv`.
`<P>_CONVENTION=native` or `xdg` overrides the caller's choice, unless the
caller also passes `conventionFromEnv: false`. Do that for a file another
program reads at a fixed path. Any other value throws `TieredDirsError`. The value is trimmed, then must match exactly, in
lower case. `parseConvention(value)` parses a convention from anywhere else,
such as a flag: exactly `native` or `xdg`, untrimmed, like the Rust crate's
`FromStr`. `xdgBaseDirs(home, env)` builds the XDG table under any home, on
any host.

`homeDir()` is the home directory the per-OS table is built on: `HOME`
(`USERPROFILE` on Windows) when it is absolute, else the OS account's home.
`homeDir({ env })` reads only the injected environment and throws
`MISSING_BASE_DIR` when it names no absolute home. `expandTilde(path, home)`
expands a leading `~` (and `~\` on Windows) for a path a caller reads from a
`.env` file or CI YAML, where no shell expanded it. The resolvers never call
it: a relative `XDG_*` value, `~` included, is ignored.

```ts
import { expandTilde, homeDir } from '@osdlc/tiered-dirs'

homeDir({ platform: 'linux', env: { HOME: '/home/ada' } })
// /home/ada
expandTilde('~/notes', '/home/ada', 'linux')
// /home/ada/notes
```

## Overrides and scratch roots

Every base directory can be moved by environment variable, so a test or harness
can run a whole app inside one scratch root. The caller picks the names:
`envVars('EXAMPLE')` reads `EXAMPLE_ROOT`, `EXAMPLE_<HOME>_DIR`,
`EXAMPLE_SCRATCH_DIR`, `EXAMPLE_REQUIRE_OVERRIDE` and `EXAMPLE_CONVENTION`.
`overrideVars(vars)` lists the ones that move a directory, and
`isOverridden(vars, env)` says whether any of them is set to a non-empty value
(`env` defaults to `process.env`). For each base directory, the first source
that is set wins:

| order | source | effect |
|---|---|---|
| 1 | `<P>_<HOME>_DIR` | moves one: `<P>_DURABLE_DIR`, `<P>_CONFIG_DIR`, `<P>_CACHE_DIR`, `<P>_STATE_DIR`, `<P>_LOGS_DIR`, `<P>_RUNTIME_DIR`, `<P>_SCRATCH_DIR` |
| 2 | `<P>_ROOT` | the rooted layout: `<root>/durable`, `<root>/config`, `<root>/cache`, `<root>/state`, `<root>/logs`, `<root>/scratch`, runtime at `<root>/durable/run` |
| 3 | the OS default | the table above, for `<P>_CONVENTION` when set, else `opts.convention`, else `native` |

Runtime follows durable: when `<P>_RUNTIME_DIR` is unset but durable is moved by
step 1 or 2, runtime is `<durable>/run`. An empty variable counts as unset. A
relative one is an error. `opts.overrides` on `systemBaseDirs` takes precedence
over all three. `rootedBaseDirs(root)` builds the layout of step 2 directly.

### Tests never resolve a real home

When neither `env` nor `home` is injected, `systemBaseDirs` applies two rules
first:

- In a test runner process where `<P>_ROOT` is unset and `HOME` is not moved,
  `<P>_ROOT` reads as `<tmp>/tiered-dirs-test-<pid>-<start ms>`. "HOME moved"
  means `HOME` differs from the passwd home. The Rust crate has no such
  condition. It exists so a test that points `HOME` at a fixture keeps its
  paths. `{ testRoot: false }` turns the test-root default off. A CI job that
  sets `HOME` itself, such as a GitHub Actions container job
  (`HOME=/github/home`, passwd home `/root`), therefore gets no test-root
  default. Set `<P>_ROOT` there. A test runner process is one with a test file
  as its entry point that runs with `NODE_ENV=test`, `NODE_TEST_CONTEXT` (set
  by `node --test`) or under Bun. A Vitest worker counts too. A child process
  a test spawns gets no default, because its entry point is neither a test
  file nor a Vitest worker.
- With `<P>_REQUIRE_OVERRIDE` set, a root that would fall back to the per-OS
  table throws a `TieredDirsError` naming the fix.

In a test runner process, `testRoot()` returns that root, cached per module
instance (per test file under Vitest's default isolation). Elsewhere it returns
`undefined`. A layer that reads its own variables, such as a
product tier, uses it to apply the same default. Pass `{ testRoot: false }`
to `systemBaseDirs` or `TieredDirs.fromEnv` to skip the first rule only.
`<P>_ROOT` and `<P>_REQUIRE_OVERRIDE` still apply.

## Scratch

`scratch()` returns the platform temp directory: `$TMPDIR` or `/tmp`, and
`%TEMP%` / `%TMP%` on Windows. It adds nothing to the platform's value. It
exists so that "no direct OS path call outside this package" can be checked
with a search.

Scratch is not a `Home` and not a tier. It holds state that does not outlive a
single call. The `runtime` home holds state that does and describes a live
process: a pidfile, a socket, a lock.

## Injectable roots

Nothing below `systemBaseDirs` reads the environment. A `TieredDirs` resolves
its roots once, at construction, and every path after that is pure string work.
A server that cannot read the environment hands in roots from its own config:

```ts
import { TieredDirs, type BaseDirs } from '@osdlc/tiered-dirs'

const bases: BaseDirs = {
  durable: '/srv/data',
  config: '/srv/config',
  cache: '/srv/cache',
  state: '/srv/state',
  logs: '/srv/logs',
  runtime: '/srv/run',
  scratch: '/srv/tmp',
}
const dirs = new TieredDirs('com.example', bases)
dirs.vendor().cache().path
// /srv/cache/com.example
```

Every `BaseDirs` field is `readonly`. To change a root, build a new object, for
example `{ ...bases, cache: '/srv/other' }`.

Tests use the same constructor to check exact paths without touching a real
home directory.

## Failure

Every base directory can fail to resolve, because headless CI and sandboxes
do not always have a home. `systemBaseDirs` and `TieredDirs.fromEnv` throw
`TieredDirsError` rather than assert. In an environment with no home at all,
pass the roots through `overrides`. `vendor`, `suiteKey`, `tool`, `kind`, `key` and `app` are
each checked as a single path segment: non-empty, no separator, no `..`,
matching `/^[a-z0-9][a-z0-9._-]*$/i`, and not `state`, `logs` or `run`.
`isValidSegment(key)` is that rule. An invalid one throws `TieredDirsError`.

`TieredDirsError.code` says which failure it is, one code per variant of the
Rust crate's `Error`. Its type is `TieredDirsErrorCode`:

| code | when |
|---|---|
| `MISSING_BASE_DIR` | a root needs a home directory and none can be found |
| `RELATIVE_OVERRIDE` | an override variable holds a relative path |
| `OVERRIDE_REQUIRED` | `<P>_REQUIRE_OVERRIDE` is set and a root would fall back to the per-OS table |
| `INVALID_CONVENTION` | `<P>_CONVENTION` or `parseConvention` got a value other than `native` or `xdg` |
| `INVALID_KEY` | a segment fails `isValidSegment` |

The message gives the details, such as the variable or the key.

## API

```typescript
function envVars(prefix: string): EnvVars
function overrideVars(vars: EnvVars): readonly string[]
function isOverridden(vars: EnvVars, env?: Record<string, string | undefined>): boolean
interface EnvVars {
  root: string
  dirs: Record<keyof BaseDirs, string>
  requireOverride: string
  convention: string
}

function isValidSegment(key: string): boolean

type Home = 'durable' | 'config' | 'cache' | 'state' | 'logs' | 'runtime'
const HOMES: readonly Home[]
type Convention = 'native' | 'xdg'
const CONVENTIONS: readonly Convention[]
function parseConvention(value: string): Convention
type TierKind = 'vendor' | 'suite' | 'standalone'
const TIER_KINDS: readonly TierKind[]
interface BaseDirs {
  readonly durable: string
  readonly config: string
  readonly cache: string
  readonly state: string
  readonly logs: string
  readonly runtime: string
  readonly scratch: string
}
interface ResolveOptions {
  platform?: string
  convention?: Convention
  conventionFromEnv?: boolean // default true
  env?: Record<string, string | undefined>
  home?: string
  overrides?: Partial<BaseDirs>
  testRoot?: boolean // default true
}
function systemBaseDirs(vars: EnvVars, opts?: ResolveOptions): BaseDirs
function testRoot(): string | undefined
function rootedBaseDirs(root: string): BaseDirs
function xdgBaseDirs(home: string, env: Record<string, string | undefined>): BaseDirs
function homeDir(opts?: Pick<ResolveOptions, 'platform' | 'env'>): string
function expandTilde(path: string, home: string, platform?: string): string

class TieredDirs {
  constructor(vendor: string, bases: BaseDirs)
  static fromEnv(vendor: string, vars: EnvVars, opts?: ResolveOptions): TieredDirs
  readonly vendorName: string
  readonly bases: Readonly<BaseDirs>
  vendor(): Tier
  suite(suiteKey: string): Tier
  standalone(tool: string): Tier
  scratch(): Dir
  isVendorBundleId(bundleId: string): boolean
}
function isVendorBundleId(vendor: string, bundleId: string): boolean

// Tier and Dir are exported as types only. Get one from the methods above.
class Tier {
  readonly segment: string
  readonly kind: TierKind
  durable(): Dir
  config(): Dir
  cache(): Dir
  state(): Dir
  logs(): Dir
  runtime(): Dir
  home(home: Home): Dir
}

class Dir {
  readonly base: string
  readonly segments: readonly string[]
  get path(): string // absolute, host separator
  get relative(): string // below the base, always "/"-separated
  scoped(kind: string, key: string): Dir
  app(app: string): Dir
}

type TieredDirsErrorCode =
  | 'MISSING_BASE_DIR'
  | 'RELATIVE_OVERRIDE'
  | 'OVERRIDE_REQUIRED'
  | 'INVALID_CONVENTION'
  | 'INVALID_KEY'
class TieredDirsError extends Error {
  readonly code: TieredDirsErrorCode
}
```

## Parity

This package matches the Rust `tiered-dirs` crate.
`packages/rust/tiered-dirs/tests/fixtures/parity.json` in the repository is
the contract between them: a table of (tier, home, scope, app) to expected
relative path, a `scratch_cases` list for the scratch root, `env_cases` for the
override order, `convention_cases` for the XDG layout under a stub home and
`rejected_conventions`. Both suites read that one file with base directories
stubbed: `rootedBaseDirs('/stub')` here, `BaseDirs::rooted("/stub")` there.
Neither package may add a path shape the other lacks.

## Stability

Every export is stable in 0.x, and its TSDoc says so: `TieredDirs`,
`TieredDirsError`, `envVars`, `overrideVars`, `isOverridden`,
`systemBaseDirs`, `testRoot`, `rootedBaseDirs`, `xdgBaseDirs`, `homeDir`, `expandTilde`,
`parseConvention`, `isValidSegment`, `isVendorBundleId`, `HOMES`,
`CONVENTIONS`, `TIER_KINDS` and the types `Tier`, `Dir`, `BaseDirs`, `EnvVars`, `Home`,
`Convention`, `TierKind`, `ResolveOptions` and `TieredDirsErrorCode`. A
breaking change to one of them ships only in a new 0.x minor release, with a
CHANGELOG entry that starts with `Breaking:`.

Some of them may grow in a minor release, because the matching Rust types are
`#[non_exhaustive]`: `TierKind` and `Convention` may gain a member,
`TieredDirsErrorCode` a code, and `EnvVars` a name. A `switch` over one of the
unions needs a `default` arm. Build `EnvVars` with `envVars()`, not by hand,
so a new name is filled in. `Home` is exhaustive on purpose. A new home
changes every caller's layout, so adding one is a breaking release.

## Runtimes and platforms

Node.js 22 or later, ESM only. The built package is tested on Node.js 22 and
24, on Linux and macOS. The code uses `node:os` and `node:path` only. The path
tables above cover Windows, and the tests check all three tables by injecting
the platform. The tests compare paths without depending on the separator, but
they do not run on a Windows host in CI yet. Bun is not tested, though the
test-root rule recognises it.

## Security

The package builds path strings. It runs no commands, writes no files and
creates no temporary files. Every caller-supplied segment is checked, and an
override variable must be an absolute path. See [SECURITY.md](./SECURITY.md).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
