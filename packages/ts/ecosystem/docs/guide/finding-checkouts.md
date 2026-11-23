---
title: Finding checkouts
description: Where osdlc tools look for a person's checkouts of a repository, how a checkout matches, and how to test it.
---

A tool that works on a repository by name, such as pr-update with a `--repo`
that is not the project it runs in, has to find the person's own checkout of
it. `@osdlc/ecosystem/repositories` answers that the same way for every osdlc
tool.

## 1. Where to look: the roots

The roots come from `repositories.yaml` in the osdlc config home:

```yaml
roots:
  - ~/dev/repos
  - /srv/checkouts
```

`resolveRoots(opts)` reads them. An absolute entry or one starting `~/` is a
root. A relative entry is dropped with a warning naming the file, a root that
does not exist is skipped without one, and `roots: []` means scan nothing.

```ts
import { resolveRoots } from '@osdlc/ecosystem/repositories'

const { roots, source, file } = resolveRoots({ caller: process.cwd() })
// roots: ['/home/me/dev/repos'], source: 'file', file: '/home/me/.config/osdlc/repositories.yaml'
```

Warnings go to `onWarn`, a line on stderr by default. Pass your own to route
them through your tool's output.

## 2. With no file: the default roots

When the file is missing or has no `roots`, `defaultRoots` works them out from
`caller`, a path inside the caller's own checkout:

1. Find the main checkout (a linked worktree counts as its main checkout).
2. Take the directory that holds it.
3. If that directory is named after the owner in the checkout's own `origin`,
   in any letter case, take the one above instead. So
   `~/dev/acme/widgets` with `origin` at `acme/widgets` gives `~/dev`, which
   holds every owner.

It never steps to or above the home directory. `~/widgets` gives `~`,
`~/acme/widgets` gives `~/acme`, and a checkout that is the home directory
gives no root. Without `caller` there are no default roots.

## 3. Matching a checkout

```ts
import { CheckoutLocator } from '@osdlc/ecosystem/repositories'

const locator = new CheckoutLocator({ caller: process.cwd() })
const matches = locator.locate('github.com/acme/widgets')
```

The first `locate` walks each root with typed-git's `scanForCheckouts`
(three levels deep by default, `maxDepth` to change it), resolves each
checkout to its main checkout, and reads its `origin` with `readRemote`. An
`origin` such as `git@github-work:acme/widgets.git` uses an SSH config alias;
`readRemote` asks `ssh -G` for the host behind it. Pass `resolveAlias` to
answer without ssh.

A target matches when `sameRepo` says so: owner and name in any letter case,
and the host when both name one. `acme/widgets` names no host, so it matches
on any. Every match comes back, sorted by path, each repository's main
checkout once, so a caller can check each one for unpushed work.

A directory the walk finds (a symlink is followed) counts only when git, run
in it, says it is the top of a working tree (`git rev-parse
--is-inside-work-tree --show-cdup` prints `true` and nothing more). A `.git`
git cannot use, such as an empty or half-made folder, sends git upward to a
repository around it, such as a dotfiles repository at the home directory;
that answer is dropped. git runs with `GIT_CEILING_DIRECTORIES` set to the
directory's parent, but that alone is not enough: the variable cannot hold a
path with `:` (`;` on Windows) in it. No paths are compared, so a root spelled
in another letter case on a case-insensitive disk finds the same checkouts.

Every git call the package makes, for the default roots too, runs without an
inherited `GIT_DIR`, `GIT_WORK_TREE` or other variable that picks a
repository. So inside a git hook, the default roots come from the caller's
own checkout and the locator reads each checkout, not the hook's repository.

A bare store with its worktrees beside it (`proj/.git` a file pointing at
`proj/.bare`) is not found yet: `proj` is not a working tree, and the walk
does not enter it.

When nothing matches, `locator.depthLimited` says how many directories the
walk left unopened at `maxDepth`. Above zero, the checkout may sit deeper:

```ts
if (matches.length === 0 && locator.depthLimited > 0) {
  console.log(`${locator.depthLimited} directories were deeper than the scan looked`)
}
```

## 4. Many targets, one scan

A locator keeps its index. Make one per run and call `locate` for each
target:

```ts
const locator = new CheckoutLocator({ caller: process.cwd() })
for (const target of targets) {
  const found = locator.locate(target)
  if (found.length === 0) {
    console.log(`${target}: not under ${locator.roots.join(', ')}; set roots in ${locator.file}`)
  }
}
```

A checkout made after the first `locate` is not in that locator's index.
`locateCheckout(target, opts)` is the one-shot form: it scans for that call
alone.

## 5. Asking the person, and writing the answer

```ts
import { repositoriesFile } from '@osdlc/ecosystem/repositories'

const file = repositoriesFile()
const current = file.read()
// ... ask the person ...
file.writeRoots(['~/dev/repos'], { etag: current?.etag ?? null })
```

The write is a compare-and-swap: if the file changed since `read`, it throws
`WriteConflictError`, which `@osdlc/ecosystem/repositories` re-exports from
`@osdlc/etag-write`, and writes nothing. It edits only the `roots` entry:
every other line stays as written, comments included. The comments inside the
old list go, and the old value's trailing comment replaces the one on the
`roots:` line. It refuses a root the reader would drop.

## 6. In tests

- Pass `home`, and an `env` with no osdlc variables, or a `dirs` rooted in a
  temp directory. The directories then never reach the real home.
- Clear `OSDLC_REPOSITORIES` in `process.env` (`vi.stubEnv('OSDLC_REPOSITORIES', '')`):
  it is read there, as config-layers reads it.
- Pass `resolveAlias`, so `ssh` never runs.
- Keep git off the person's own config: point `GIT_CONFIG_GLOBAL` at an empty
  file and set `GIT_CONFIG_NOSYSTEM=1`. A global `url.<base>.insteadOf` would
  otherwise change what each `origin` reads as.
- Compare real paths: git reports them, and macOS's temp directory is a
  symlink.
