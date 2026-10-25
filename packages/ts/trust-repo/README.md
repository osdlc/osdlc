# @osdlc/trust-repo

Per-repository consent to run a repository's own scripts, remembered across
runs.

## Install

```sh
npm install @osdlc/trust-repo
```

`pnpm add @osdlc/trust-repo` and `yarn add @osdlc/trust-repo` work too.

ESM only. Node.js 22 or later. Bun also works.

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

`trustStore({ tool, env?, home?, dir? })` returns:

| Member | Does |
|---|---|
| `dir()` | the store's directory: `dir` verbatim when given, else `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/` when unset |
| `resolveRoot(root)` | the absolute, symlink-resolved key a root's grant is stored under |
| `markerPath(root)` | the marker file's path for `root`, without creating it (for a `--show` command) |
| `isTrusted(root)` | whether the root has a grant |
| `trust(root)` | records a grant and returns `{ root, marker, alreadyTrusted }`. Safe to repeat. `alreadyTrusted` says whether a grant already existed |
| `untrust(root)` | removes a grant; `false` when there was none |
| `list()` | every trusted path for this tool, sorted; `[]` when the store has never been written to |

`home` defaults to `homeDir()`: `os.homedir()` when it is absolute, else the
OS account's home. A relative `HOME` is treated as unset, so the store never
lands inside the folder the tool runs in.

A test passes its own `env` and `home`, so it never reads or writes the
developer's real trust store. `dir` sets the store's directory directly and
skips the `tool` and XDG lookup. Use it when a tool has its own environment
variable (for example `TOOLY_TRUST_STATE`) that names the marker directory
itself, not an `XDG_STATE_HOME` to add `tool` and `trusted` to.

### Where the store lives

In the XDG state directory, not the config directory: `$XDG_STATE_HOME`, or
`~/.local/state` when it is unset. A relative `XDG_STATE_HOME` is ignored, as
the XDG spec says, so the store never lands inside the directory a tool runs
in. This holds on every platform, macOS
included, and matches the paths `@osdlc/config-layers` uses. Trust is state
a program keeps, not configuration a person edits, so it is not stored next
to a tool's `config.yaml`. People sync config files between machines, for
example in a dotfiles repo. A consent record for one machine that is copied
to another machine is no longer consent.

### What a decision is keyed on

The absolute, symlink-resolved repository root. It is a path, not a hash of
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

Two stores for two different `tool` names never share a directory, so
`tooly`'s grants and another tool's grants are independent even on one machine.

## The gate

`resolveExecGate(store, { root, configured, flag?, trusted? })` combines a
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

When `args.trusted` is set, it is used instead of `store.isTrusted(root)`.
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

The order is marker, then `policy.paths`, then `policy.owners`. `paths` are globs
(`**` crosses segments, `*` and `?` stay inside one; `pathGlobToRegExp`) matched as strings
against the resolved, symlink-free root, after the caller's `expandPath` has expanded `~` and
its own `{name}` tokens. `owners` match case-insensitively against `ownerOf(root)`, the
host and owner of the root's `origin` remote as `host/owner`. An entry is
`host/owner` (`gitlab.com/my-org`) or a bare `owner`, which means
`github.com/owner`. A bare owner from `ownerOf` is read the same way. So
`my-org` does not match a clone from `gitlab.com/my-org`. This package knows no git, so without an `ownerOf` the
`owners` rule never matches; the tool supplies a git-backed one.

Owner trust believes the repository about itself. A git-backed `ownerOf`
reads the remote URL the repository's own git config reports, and that
config arrives with the directory. A folder unpacked from an archive, copied
from a shared drive, or cloned by someone else can name any owner. So
`owners` fits clones you made yourself. `paths` is the stronger form: it
names where the repository is on your disk, which the repository cannot
choose.

## Wording

`withheldHint` takes the trust verb and the per-run flag in an optional second
argument. A tool with a nested verb (`tooly repo trust`) or a different flag name
(`--trust`) passes its own and does not need to write its own message.

## Runtime

Runs under Bun and Node. It uses `node:fs/promises`, `node:path`, `node:crypto`,
`node:os`, `@osdlc/etag-write` and `@osdlc/path-guard`. It does not use `child_process`.

## Stability

The package is 0.x, so any minor release may break the API. Every export is
experimental. The package decides whether a repository's own scripts may run,
and its policy layer is new. Its shape stays open until it has had a security
review. Any release may change or remove an experimental export.

The experimental exports of `@osdlc/trust-repo`:

`ExecGate`, `PolicyBy`, `PolicyDecision`, `PolicyDecisionOptions`, `ResolveExecGateArgs`,
`TRUST_MARKER_DIR`, `TrustBy`, `TrustDecision`, `TrustPolicy`, `TrustResult`, `TrustStore`,
`TrustStoreOptions`, `homeDir`, `pathGlobToRegExp`, `policyDecision`, `policyExecGate`, `resolveExecGate`,
`resolveTrustRoot`, `trustDecision`, `trustStore`, `trustStoreDir`, `withheldHint`, `xdgHome`

A test compares this list with the `@experimental` tags in the source.

## Platforms and runtimes

Linux and macOS for the 0.x line. Windows support is planned before 1.0. The
store uses XDG state paths on every platform, so it does not run on Windows
today.

Node.js 22 or later, ESM only. Bun also runs it, through the compiled `dist/`. The tests run
on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
