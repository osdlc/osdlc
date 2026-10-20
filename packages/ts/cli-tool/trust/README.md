# `@osdlc/cli-tool/trust`

Per-repository consent to run a repository's own scripts, remembered across
runs.

```ts
import { resolveExecGate, trustStore, withheldHint } from '@osdlc/cli-tool/trust'

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

Some things a tool does to a repository it did not write are code execution
in disguise — running that repository's own scripts, evaluating its build
config, firing its hooks. A setting the repository itself can write (its own
config file, its own build config) cannot be what authorizes that, because a
setting a repository can write is a setting a repository can grant itself.
So the tool asks a person once, per repository, and remembers the answer
here.

Any tool of the `@osdlc/cli-tool` shape gets its own store by name.

## The store

`trustStore({ tool, env?, home?, dir? })` returns:

| Member | Does |
|---|---|
| `dir()` | the store's directory: `dir` verbatim when given, else `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/` when unset |
| `resolveRoot(root)` | the absolute, symlink-resolved key a root's grant is stored under |
| `markerPath(root)` | the marker file's path for `root`, without creating it (a `--show` surface) |
| `isTrusted(root)` | whether the root has a grant |
| `trust(root)` | records a grant; `{ root, marker, alreadyTrusted }` — idempotent, reports whether one already existed |
| `untrust(root)` | removes a grant; `false` when there was none |
| `list()` | every trusted path for this tool, sorted; `[]` when the store has never been written to |

`env`/`home` are injectable the way `machineConfigFile`'s are: a test
supplies a throwaway pair so it can never read or write the developer's real
trust store. `dir` is a stronger override still — it bypasses the `tool` +
XDG derivation outright, for a consumer that mirrors a machine-config-style
env var (for example `TOOLY_TRUST_STATE`) pointing straight at the marker
directory rather than at an `XDG_STATE_HOME` to join `tool` and `trusted`
onto.

### Where the store lives

XDG **state**, not config — `$XDG_STATE_HOME`, `~/.local/state` otherwise,
used on every platform including macOS, matching
`@osdlc/config-layers`'s paths. Trust is state a
program maintains, not configuration a person hand-edits: it deliberately
does not sit beside a tool's `config.yaml`. A grant living in a file people
edit and sync between machines would travel with a dotfiles repo, and a
per-machine consent record that follows you onto a new machine has stopped
being consent.

### What a decision is keyed on

The absolute, symlink-resolved repository root — a path, not a hash of the
repository's contents. Two paths that name one repository are one decision,
because a person answering the question answered it about the repository,
not about the spelling they used to reach it. A repository trusted once that
later pulls hostile changes stays trusted; `untrust` is the only remedy.
Content-hashing would re-prompt on ordinary edits, training people to
approve without reading — weaker security than an honest weaker rule.

### How it is stored

A directory of marker files, one per trusted root, named
`${basename(root)}-${sha256(root).slice(0, 16)}`, containing the resolved
absolute path. Creating and unlinking a file are atomic and independent, so
two processes trusting two different repositories at once cannot lose each
other's write, and a temp-file-then-rename write means a marker that exists
is always a complete grant, never a partial one.

Two stores for two different `tool` names never share a directory, so
`tooly`'s grants and another tool's grants are independent even on one machine.

## The gate

`resolveExecGate(store, { root, configured, flag?, trusted? })` is the one
place a tool's configured value, an explicit per-run flag and the store
combine into the boolean the tool actually acts on, so every caller of a
store agrees on the answer:

| flag | configured | trusted | allowExec | reason |
|---|---|---|---|---|
| `false` | any | any | `false` | `configured-off` |
| `true` | any | any | `true` | `allowed-by-flag` |
| (none) | `false` | any | `false` | `configured-off` |
| (none) | `true` | `false` | `false` | `untrusted` |
| (none) | `true` | `true` | `true` | `allowed` |

`flag: false` short-circuits without consulting the store. `flag: true` is
consent for one run — reported truthfully in `trusted` but never recorded,
so one deliberate `--trust`-style override never becomes a standing grant
nobody remembers giving.

`args.trusted`, when present, is used INSTEAD OF `store.isTrusted(root)` —
the hook a tool uses to layer a policy over the marker store. A caller that
already computed a broader decision (a marker OR a path/owner policy, as
`trustDecision`/`policyExecGate` do) hands the boolean
straight through rather than paying for a second, marker-only lookup that
could disagree with it. `root` is still resolved through `store.resolveRoot`
either way, so a marker key and a policy match always agree on one root's
resolved spelling.

`withheldHint(toolName, { verb = 'trust', flag = '--exec' })` is the one
sentence every surface (CLI, TUI, a web page) shows when the gate withholds
something, so a user never reads a different instruction in two places.
`flag: null` drops the per-run half of it, for a surface that accepts no
such flag — the sentence must not name a remedy the command will reject.

## The standing policy

A marker is one person's decision about one repository. A tool whose machine file
carries a `trust:` block (`paths` globs and `owners`, in the tool's own
`@osdlc/config-layers` machine schema) layers that policy over the store:

```ts
import { policyExecGate, trustDecision } from '@osdlc/cli-tool/trust'

const policy = { paths: ['~/work/**'], owners: ['my-org'] }
const decision = await trustDecision(trust, root, policy, { expandPath, ownerOf })
// { trusted: true, by: 'marker' | 'path' | 'owner', rule? } or { trusted: false, by: null }

const gate = await policyExecGate(trust, policy, { root, configured, flag }, { expandPath, ownerOf })
```

The order is marker, then `policy.paths`, then `policy.owners`. `paths` are globs
(`**` crosses segments, `*` and `?` stay inside one; `pathGlobToRegExp`) matched as strings
against the resolved, symlink-free root, after the caller's `expandPath` has expanded `~` and
its own `{name}` tokens. `owners` match case-insensitively against `ownerOf(root)`, the
owner of the root's `origin` remote. This package knows no git, so without an `ownerOf` the
`owners` rule never matches; the tool supplies a git-backed one.

## Wording

`withheldHint` takes the trust verb and the per-run flag as a second, defaulted
options object, so a tool that nests its verb (`tooly repo trust`) or spells its
override differently (`--trust`) does not have to write its own copy.

## Runtime

`node:fs/promises`, `node:path`, `node:crypto`, `node:os` only; no
`child_process`. Runs under Bun and Node.
