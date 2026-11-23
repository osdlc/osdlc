# @osdlc/ecosystem

The facts every osdlc tool shares, one module per concern. A tool imports
only the concern it needs, through its subpath.

| Import                          | Concern                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@osdlc/ecosystem`              | Where the family's directories are: `osdlc` in each home, pinned to the Xdg convention          |
| `@osdlc/ecosystem/repositories` | Where a person's checkouts are: `repositories.yaml`, its default roots, and finding a checkout |

The family's files sit directly in the osdlc config home
(`~/.config/osdlc/` on Linux and macOS with no variable set). This package
owns them: a tool reads and writes them only through it, so every tool parses
them, and asks the person for them, the same way. A tool's own files stay in
`osdlc/<tool>/`. The rules are in the
[machine-files standard](https://github.com/osdlc/osdlc/blob/main/standards/machine-files.md), and
[D-ZVIA](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-ZVIA-osdlc-ecosystem-package.md) says why
the package exists.

## Guide

- [Finding checkouts](https://github.com/osdlc/osdlc/blob/main/packages/ts/ecosystem/docs/guide/finding-checkouts.md): the roots, the
  defaults, matching a remote, and a run with many targets.

## Install

```sh
npm install @osdlc/ecosystem
```

`pnpm add @osdlc/ecosystem` and `yarn add @osdlc/ecosystem` work too.

ESM only. Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0`, the range of
`@osdlc/typed-git`, which it builds on. It runs `git`, and `ssh -G` for an
`origin` that uses an SSH config alias.

## Quick start

```ts
import { CheckoutLocator } from '@osdlc/ecosystem/repositories'

// One locator per run: it scans the roots once, on the first locate().
const locator = new CheckoutLocator({ caller: process.cwd() })

for (const target of ['acme/widgets', 'github.com/acme/gadgets']) {
  const found = locator.locate(target)
  if (found.length === 0) {
    const where = locator.roots.length === 0 ? 'no roots' : locator.roots.join(', ')
    console.log(`${target}: no checkout under ${where}; roots are set in ${locator.file}`)
  }
  for (const checkout of found) console.log(`${target}: ${checkout.path}`)
}
```

[examples/readme.test.ts](https://github.com/osdlc/osdlc/blob/main/packages/ts/ecosystem/examples/readme.test.ts) runs this example in a
temporary home.

## `repositories.yaml`

```yaml
# <osdlc config home>/repositories.yaml
roots:
  - ~/dev/repos
  - /srv/checkouts
```

| Entry                                 | Meaning                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| An absolute path, or one starting `~` | A root. `~` and `~/…` are expanded against the home directory        |
| A relative path, or `~user/…`         | Dropped, with a warning naming the file                              |
| A root that does not exist            | Skipped silently: the file may list another machine's directories   |
| `roots: []`                           | Scan nothing                                                         |
| No file, or no `roots`                | The default roots, worked out from the caller's checkout (below)     |

The schema is strict: an unknown key is reported, with the file's path, and
ignored. `OSDLC_REPOSITORIES` moves the file. Its value must be an absolute
path to the file; a relative one throws before anything is read.

The roots are machine-only. A repository's config cannot set them, so a cloned
repository cannot point a tool at directories on a person's disk.

## Default roots

With no `roots`, the root is the directory that holds the caller's main
checkout, or the one above it when that directory is named after the owner in
the caller's own `origin`, in any letter case. So an `<owner>/<name>` layout
resolves to the directory above every owner.

| Caller's main checkout            | Default root        |
| --------------------------------- | ------------------- |
| `~/dev/repos/widgets`             | `~/dev/repos`       |
| `~/dev/acme/widgets`, owner acme  | `~/dev`             |
| `~/widgets`                       | `~`                 |
| `~/acme/widgets`, owner acme      | `~/acme`, not `~`   |
| `~` itself                        | none                |
| No caller, or not in a checkout   | none                |

It never steps to or above the home directory. A linked worktree counts as its
main checkout.

## Finding checkouts

`new CheckoutLocator(opts)` resolves the roots at once, so `roots`, `source`
(`file` or `default`) and `file` are there for a caller's messages. The first
`locate(target)` walks the roots with typed-git's `discoverCheckouts`, reads
each checkout's `origin` with `readRemote`, and keeps the index for every
later call. `locateCheckout(target, opts)` is the one-shot form.

`target` is `owner/name`, which matches on any host, `host/owner/name`, or a
typed-git `RepoCoordinate`. Owner and name match in any letter case, and the
host when both sides name one (`sameRepo`). Every match comes back, sorted by
path, each repository's main checkout once:

```ts
interface LocatedCheckout {
  path: string // the main checkout, absolute
  origin: RemoteRepo // { host, owner, repo }, with an SSH alias resolved
}
```

## Writing roots

A tool that asks the person where their checkouts are writes the answer
through the package, with a compare-and-swap:

```ts
import { repositoriesFile } from '@osdlc/ecosystem/repositories'

const file = repositoriesFile()
const current = file.read() // { text, etag } or null
file.writeRoots(['~/dev/repos'], { etag: current?.etag ?? null })
```

It replaces `roots` and keeps the rest of the file and its comments. When the
file changed since it was read, it throws `WriteConflictError` from
`@osdlc/etag-write` and writes nothing. It refuses a root the reader would
drop.

## Testing a tool that uses it

Every function takes `env`, `home` and `dirs`, so a test keeps off the real
home: pass `home` and an `env` with no osdlc variables, or a `dirs` rooted in a
temp directory. `OSDLC_REPOSITORIES` is read from `process.env`, as
config-layers reads it, so a test clears it. Pass `resolveAlias` so `ssh` never
runs. A test that spawns a tool follows the isolation rule in the
machine-files standard.

## Stability

0.x. Every export may change in a minor release while the first tools adopt
it.

## Runtimes and platforms

Node.js on Linux and macOS is tested. Windows is expected to work, through
`@osdlc/tiered-dirs`' Windows table, and is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
