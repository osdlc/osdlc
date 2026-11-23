# @osdlc/trust-repo

Per-repository consent to run a repository's own scripts, remembered across
runs.

## Install

```sh
npm install @osdlc/trust-repo
```

`pnpm add @osdlc/trust-repo` and `yarn add @osdlc/trust-repo` work too.

ESM only. Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of its
dependency `@osdlc/typed-git`. Bun also works.

## Quick start

```ts
import { resolveExecGate, trustStore, withheldHint } from '@osdlc/trust-repo'

const trust = trustStore({ tool: 'tooly' })

// `tooly repo trust [path]`
const { root, alreadyTrusted } = await trust.trust(path ?? process.cwd())
console.log(alreadyTrusted ? `already trusted: ${root}` : `trusted: ${root}`)

// wherever project-sourced behaviour is about to run
const gate = await resolveExecGate(trust, { root: repoRoot, configured, flag: flags.trust })
if (!gate.allowExec) {
  throw new Error(`${verbName}: ${withheldHint('tooly', { verb: 'repo trust', flag: '--trust' })}`)
}
```

## Why

Some things a tool does to a repository it did not write run that
repository's code: its own scripts, its build config, its hooks. A setting
inside the repository (its config file, its build config) cannot authorize
this. The repository could grant itself that setting. So the tool asks a
person once per repository and stores the answer here.

Any CLI tool gets its own store by name.

## The store

`trustStore({ tool, app?, vendorDirs?, dirs?, legacyDir?, env?, home?, dir? })` returns:

| Member | Does |
|---|---|
| `dir()` | the store's directory: `dir` verbatim when given, else `<state home>/<tool>[/<app>]/trusted/` when `vendorDirs` is given, else `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/` when unset ([Where the store lives](#where-the-store-lives)) |
| `resolveRoot(root)` | the absolute, symlink-resolved key a root's grant is stored under |
| `markerPath(root, scope?)` | the marker file's path for a grant, without creating it (for a `--show` command) |
| `isTrusted(root, scope?)` | whether the root has a whole-repository grant or a grant for `scope` |
| `trust(root, scope?)` | records a grant and returns `{ root, scope, marker, alreadyTrusted }`. With no `scope` the grant covers the whole repository; an explicit `'*'` throws. Safe to repeat. `alreadyTrusted` says whether this exact grant already existed |
| `untrust(root, scope?)` | removes exactly that grant; `false` when there was none |
| `untrustAll(root)` | removes every grant for the root (its marker and its whole `.scopes/` folder) and returns the scopes removed |
| `list()` | every root with a whole-repository grant, sorted; `[]` when the store has never been written to |
| `listGrants()` | every grant as `{ root, scope, marker }`, sorted by root, then scope with `*` first |
| `tighten()` | sets the store directory to 0700 and each marker to 0600 where looser; returns the paths it changed |

`scope` defaults to `WHOLE_REPO_SCOPE` (`'*'`), the whole repository. A scope
is trimmed first, so `'just '` and `'just'` are one grant. A scope that is
then empty, longer than 200 characters or holds a control character throws a
`TypeError`.

`trust()` refuses an explicit `'*'`. A whole-repository grant is
`trust(root)`, with no scope, so a scope a person typed can never widen into
one. `isTrusted`, `untrust` and `markerPath` still take `'*'`, since reading
or removing a grant widens nothing. `parseTrustScope(input)` applies the same
rules to a `--scope` value before it reaches the store: it trims, checks and
refuses `*`, and throws a `TypeError` a CLI can report as a usage error.

`home` defaults to `homeDir()`, `@osdlc/tiered-dirs`'s home: `HOME`
(`USERPROFILE` on Windows) when it is absolute, else the OS account's home. A
relative `HOME` is treated as unset, so the store never lands inside the
folder the tool runs in.

A test passes its own `env` and `home`, so it never reads or writes the
developer's real trust store. `dir` sets the store's directory directly and
skips every other lookup, and nothing is moved into it. Use it when a tool
has its own environment variable (for example `TOOLY_TRUST_STATE`) that names
the marker directory itself, not a state home to add `tool` and `trusted` to.

`trustStoreDir(options)` returns the directory a store built from the same
options uses, without reading the disk or moving anything.
`trustStoreDir(tool, env?, home?)` returns the old place for `tool`.

### Where the store lives

In a state directory, not a config directory. Trust is state a program
keeps, not configuration a person edits, so it is not stored next to a
tool's `config.yaml`. People sync config files between machines, for
example in a dotfiles repo. A consent record for one machine that is copied
to another machine is no longer consent.

A tool that passes `vendorDirs` gets its store from `@osdlc/tiered-dirs`,
like its other machine-local files: `<state home>/<tool>/trusted/`, or
`<state home>/<tool>/<app>/trusted/` with `app`. `vendorDirs` is the value
`@osdlc/config-layers`' `machineConfigFile` takes, `{ vendor, envVars }`, and
this package re-exports `envVars` to build it. So the store follows the same
rules as the tool's machine file:

| Case | Store |
|---|---|
| Linux, or macOS under the `xdg` convention | `$XDG_STATE_HOME/<tool>/trusted/`, else `~/.local/state/<tool>/trusted/` |
| macOS under the `native` convention | `~/Library/Application Support/<tool>/trusted/` |
| Windows | `%LOCALAPPDATA%\state\<tool>\trusted\` |
| `<PREFIX>_ROOT=/r` | `/r/state/<tool>/trusted/` |
| `<PREFIX>_STATE_DIR=/s` | `/s/<tool>/trusted/` |
| a family root, `tool: 'osdlc', app: 'pr-update'` | `<state home>/osdlc/pr-update/trusted/` |

The convention is tiered-dirs' default, `native`, unless `<PREFIX>_CONVENTION`
names another. A tool that pins its convention, as the osdlc family pins
`xdg`, passes the same `dirs` factory it gives `machineConfigFile`:

```ts
import { envVars, trustStore } from '@osdlc/trust-repo'
import { systemDirs } from '@osdlc/config-layers'

const vendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }
const dirs = () => systemDirs(vendorDirs, { convention: 'xdg', conventionFromEnv: false })
const trust = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs, dirs })
```

A store with an `app` is that app's alone. A grant through app `a` is not
seen through app `b`, nor through the family root with no app, because
consent given to one tool must never cover another. Pass the tool itself as
`app`, never only the family.

A tool that passes neither `vendorDirs` nor `dir` keeps the place every
release before this one used: `$XDG_STATE_HOME/<tool>/trusted/`, or
`~/.local/state/<tool>/trusted/` when the variable is unset, on every
platform. A relative `XDG_STATE_HOME` is ignored, as the XDG spec says, so
the store never lands inside the directory a tool runs in. No tool moves
until it opts in.

### How a store moves

When `vendorDirs` puts the store somewhere other than the old place, the old
markers are copied over once, on first use. The old place is
`$XDG_STATE_HOME/<app or tool>/trusted/`, or
`~/.local/state/<app or tool>/trusted/`. For
`{ tool: 'osdlc', app: 'pr-update' }` it is pr-update's old store. `legacyDir` names another old
store, or `null` turns the move off.

1. Every grant in the old store is copied into a new, private folder beside
   the new place.
2. Each copy is read back and checked against the grant it came from.
3. A `.moved` record, holding the old store's path, is written into the
   folder, and the folder is renamed into place.

The rename is the one step that publishes the copy. So the new store is
either complete and recorded, or not there at all, and a copy that failed
partway leaves nothing behind. Two processes that move at once each build
their own folder; the second rename fails because the first already landed,
and the second process uses that one. When the old store has no grant, the
first grant written to the new store writes the record instead; a read
creates nothing. Once the record is there, only the new place is read. A grant an older release adds to the old place later is not
copied, and a grant revoked in the new place stays revoked.

The old markers are never changed or deleted, so an older release of the
tool still finds every grant it knew. A process killed partway through, or a
cleanup Windows refused, can leave a `.trusted.moving-*` folder beside the
store. Nothing reads it, and it
is safe to delete.

A move that fails makes `isTrusted`, `trust`, `untrust` and `untrustAll`
throw, so nothing runs on a store that lost a grant. `list`, `listGrants`
and `tighten` report what the new place holds. The next call tries again.

Nothing is copied when the new place is the old place (Linux and macOS under
`xdg`, with no family root), or when `<PREFIX>_ROOT`, `<PREFIX>_STATE_DIR`
or tiered-dirs' per-process test root moved the new place. Those ask for a
separate store on purpose. A scratch store that inherited the person's real
consent would defeat a test that points `<PREFIX>_ROOT` at a temp directory.
A `dirs` factory given with neither `env` nor `home` has no old place
either, since it was not resolved from the real environment.

Nothing is copied while `<PREFIX>_CONVENTION` is set. The variable picks
between two places, and each would be filled from the same untouched old
store, so a grant revoked in one would come back in the other. Fix the
tool's convention before it opts in, in a `dirs` factory with
`conventionFromEnv: false`. While the variable is set, the store starts
empty and the person consents again; that fails closed.

If the new place already exists with no record when there is something to
move (it was made through `dir`, or by hand), the old grants are copied into
it in place, each marker atomically, then the record is written.

### What a decision is keyed on

A root and a scope. The scope is `*` for the whole repository, or one tool:
any string the tool chooses, such as a runner id. This package gives a scope
no meaning. A whole-repository grant covers every scope.

```ts
await trust.trust(root, 'just') // trust only the repository's justfile
await trust.isTrusted(root, 'just') // true
await trust.isTrusted(root, 'mise') // false, until `trust(root)` or `trust(root, 'mise')`
```

The root is the absolute, symlink-resolved repository root. It is a path, not a hash of
the repository's contents. Two paths that lead to one repository share one
decision, because the person answered about the repository, not about the
path they typed. A trusted repository stays trusted if it later pulls
hostile changes. `untrust` is the only way to remove the grant. A content
hash would ask again after ordinary edits. People asked that often learn to
approve without reading, which is less safe than a simple path rule.

### How it is stored

A directory of marker files, one per trusted root, named
`${basename(root)}-${sha256(root).slice(0, 16)}`, containing the resolved
absolute path. Creating and deleting a file are atomic and independent, so
two processes that trust two repositories at the same time cannot lose each
other's write. Each marker is written to a temp file and then renamed, so a
marker that exists is always complete.

A grant for one scope is a file in `<marker>.scopes/`, named from the scope
and its hash, holding the root and the scope on two lines. Whole-repository
markers keep the name and content they always had, so a store written by an
older release reads as it is, with no migration step.

The store directory is mode 0700 and each marker 0600, because the list of
trusted repositories is private. `trust()` tightens a store that an older
release left at 0755 and 0644, and `tighten()` does it on demand. On Windows
these modes do not apply and `tighten()` does nothing.

Two stores for two different `tool` names, or two `app`s under one `tool`,
never share a directory, so `tooly`'s grants and another tool's grants are
independent even on one machine.

## The gate

`resolveExecGate(store, { root, configured, flag?, scopes?, trusted? })` combines a
tool's configured value, an explicit per-run flag and the store into one
boolean the tool acts on. Every caller that uses it gets the same answer:

| flag | configured | trusted | allowExec | reason |
|---|---|---|---|---|
| `false` | any | any | `false` | `configured-off` |
| `true` | any | any | `true` | `allowed-by-flag` |
| (none) | `false` | any | `false` | `configured-off` |
| (none) | `true` | `false` | `false` | `untrusted` |
| (none) | `true` | `true` | `true` | `allowed` |

`flag: false` returns at once and does not read the store. `flag: true` is
consent for one run. The result's `trusted` field still reports whether the
root is trusted, but the flag is never saved. A one-time `--trust` does not
become a lasting grant that nobody remembers giving.

`scopes` lists what the run needs trusted, `['*']` by default. The root counts
as trusted only when every scope is. The result's `scopes` echoes the list and
`missing` names the scopes that are not trusted, so a tool can offer a grant
for each.

A tool can run another tool. A mise task runs mise, and mise can run its own
hooks. A task that a tool manager wraps runs that manager too. Pass every tool
a command will run, not only the one it names:

```ts
const gate = await resolveExecGate(trust, { root, configured, scopes: ['mise', 'just'] })
if (!gate.allowExec) console.log(`not trusted: ${gate.missing.join(', ')}`)
```

When `args.trusted` is set, it is used instead of `store.isTrusted(root, scope)`.
It is a boolean for every scope or a function of the scope.
This lets a tool add a policy on top of the marker store. A caller that has
already decided trust from a marker or a path/owner policy (as
`trustDecision` and `policyExecGate` do) passes that boolean in. A second,
marker-only lookup could disagree with it. `root` is still resolved through
`store.resolveRoot` in both cases, so the marker key and the policy match
use the same resolved path.

`withheldHint(toolName, { verb = 'trust', flag = '--exec' })` returns the
sentence every interface (CLI, TUI, web page) shows when the gate withholds
something, so users see the same instruction everywhere. `flag: null` drops
the per-run part, for a command that has no such flag. The sentence must
not suggest a flag the command will reject.

## The standing policy

A marker is one person's decision about one repository. A tool whose machine file
has a `trust:` block (`paths` globs and `owners`, in the tool's own
`@osdlc/config-layers` machine schema) can apply that policy on top of the store:

```ts
import { policyExecGate, trustDecision } from '@osdlc/trust-repo'

const policy = { paths: ['~/work/**'], owners: ['my-org'] }
const decision = await trustDecision(trust, root, policy, { expandPath, ownerOf })
// { trusted: true, by: 'marker' | 'path' | 'owner', rule? } or { trusted: false, by: null }

const gate = await policyExecGate(trust, policy, { root, configured, flag }, { expandPath, ownerOf })
```

`flag: false` (a `--no-exec`) returns `configured-off` before any lookup. It
reads no marker and does not call `ownerOf`, so no git runs.

`policy.scopes` holds rules for one scope each, checked after the top-level
rules, which cover every scope. `trustDecision` and `policyDecision` take the
scope as `opts.scope`. `policyExecGate` takes `scopes` like `resolveExecGate`,
calls `ownerOf` at most once, and returns one decision per scope in
`decisions`. A decision's `scope` says which grant or rules decided: `*` or the
scope itself.

```ts
const policy = { paths: [], owners: [], scopes: { just: { paths: ['~/work/**'], owners: [] } } }
const gate = await policyExecGate(trust, policy, { root, configured, scopes: ['just'] }, { expandPath })
// gate.decisions.just: { trusted: true, by: 'path', rule: '~/work/**', scope: 'just' }
```

The order is marker, then `policy.paths`, then `policy.owners`. `paths` are globs
(`**` crosses segments, `*` and `?` stay inside one; `pathGlobToRegExp`) matched as strings
against the resolved, symlink-free root, after the caller's `expandPath` has expanded `~` and
its own `{name}` tokens. `owners` match case-insensitively against `ownerOf(root)`, the
host and owner of the root's `origin` remote as `host/owner`. An entry is
`host/owner` (`gitlab.com/my-org`) or a bare `owner`, which means
`github.com/owner`. A bare owner from `ownerOf` is read the same way. So
`my-org` does not match a clone from `gitlab.com/my-org`. Without an `ownerOf`
the `owners` rule never matches.

Owner trust believes the repository about itself. A git-backed `ownerOf`
reads the remote URL the repository's own git config reports, and that
config arrives with the directory. A folder unpacked from an archive, copied
from a shared drive, or cloned by someone else can name any owner. So
`owners` fits clones you made yourself. `paths` is the stronger form: it
names where the repository is on your disk, which the repository cannot
choose.

### Expanding paths

`expandTrustPath(raw, home, { platform?, resolveRoot? })` is the `expandPath`
most tools want. It expands a leading `~` (and `~\` on Windows), then resolves
symlinks in the pattern's static prefix, the part before the first `*` or `?`.
Without it, `/tmp/**` never matches on macOS, where the root resolves to
`/private/tmp/...`. Write patterns as absolute or `~` paths. A relative one
resolves against the current directory.

```ts
import { expandTrustPath } from '@osdlc/trust-repo'

const expandPath = (raw: string) => expandTrustPath(raw, home)
```

### The git owner lookup

`@osdlc/trust-repo/git` exports `originOwner(root)`, the `ownerOf` for the
`owners` rule. It returns the host and owner of `root`'s `origin` remote as
`host/owner`, or `null`. It runs `git remote get-url origin` with
`core.fsmonitor` off and with the caller's `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`,
`GIT_CONFIG_COUNT` and `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` variables
removed, so they cannot point git at another repository. `GIT_CONFIG_GLOBAL`,
`GIT_CONFIG_SYSTEM` and `GIT_CONFIG_NOSYSTEM` are kept on purpose, as user
setup, so they can still change how the remote URL is read. A remote that is a local path, a
`github:` style shortcut or an unknown host has no owner.

```ts
import { originOwner } from '@osdlc/trust-repo/git'

const gate = await policyExecGate(trust, policy, { root, configured }, { expandPath, ownerOf: originOwner })
```

The main entry point runs no program. Only `@osdlc/trust-repo/git` runs git.

### Windows paths

Trust keys and `paths` globs are compared in one form. On Windows, `\`
becomes `/` and the drive letter becomes lower case, so `C:\Work\app` and
`c:/Work/app` are one repository. `normalizeTrustPath(path, platform?)` does
this, and `resolveTrustRoot` and `expandTrustPath` apply it. The rest of the
path keeps its case; `realpath` already gives an existing path its case on
disk.

Only the drive letter is folded. A root that no longer exists, typed in
another case (`C:\work\App` for `C:\Work\app`), does not match its old
marker, and a `paths` glob must use the case the folders have on disk. Two
different folders never share a key this way; a mismatch only makes a
grant miss.

## Wording

`withheldHint` takes the trust verb and the per-run flag in an optional second
argument. A tool with a nested verb (`tooly repo trust`) or a different flag name
(`--trust`) passes its own and does not need to write its own message.

## Runtime

Runs under Bun and Node. It uses `node:fs/promises`, `node:path`, `node:crypto`,
`node:os`, `@osdlc/etag-write`, `@osdlc/path-guard` and `@osdlc/tiered-dirs`. It does not use `child_process`.
`@osdlc/trust-repo/git` runs git through `@osdlc/command-seam` and `@osdlc/typed-git`.

## Stability

The package is 0.x, so any minor release may break the API. Every export is
experimental. The package decides whether a repository's own scripts may run,
and its policy layer is new. Its shape stays open until it has had a security
review. Any release may change or remove an experimental export.

The experimental exports of `@osdlc/trust-repo`:

`ExecGate`, `ExpandTrustPathOptions`, `PolicyBy`, `PolicyDecision`, `PolicyDecisionOptions`,
`PolicyExecGate`, `ResolveExecGateArgs`, `TRUST_MARKER_DIR`, `TrustBy`, `TrustDecision`,
`TrustGrant`, `TrustPlatform`, `TrustPolicy`, `TrustResult`, `TrustRules`, `TrustStore`,
`TrustStoreOptions`, `TrustVendorDirs`, `WHOLE_REPO_SCOPE`, `expandTilde`, `expandTrustPath`, `homeDir`,
`normalizeTrustPath`, `parseTrustScope`, `pathGlobToRegExp`, `policyDecision`, `policyExecGate`, `resolveExecGate`, `resolveTrustRoot`,
`trustDecision`, `trustStore`, `trustStoreDir`, `withheldHint`, `xdgHome`

The experimental exports of `@osdlc/trust-repo/git`:

`originOwner`

A test compares this list with the `@experimental` tags in the source.

## Platforms and runtimes

Linux and macOS for the 0.x line. Trust paths match on Windows (see Windows
paths), and those rules are tested on every platform. A store with
`vendorDirs` lives in Windows' own state home, `%LOCALAPPDATA%\state`; one
without keeps the old XDG place, under `%USERPROFILE%\.local\state`. File
modes do not apply there. Full Windows support is planned before 1.0.

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, ESM only. Bun also runs it, through the compiled `dist/`. The tests run
on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
