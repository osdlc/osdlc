---
title: Trust and execution
sidebar:
  order: 5
description: Why a repository must be trusted before some runners are read, and how that consent is stored.
---

Some runners can only be read by running them. Reading moon's task graph
evaluates the repository's toolchain configuration. Reading mise's tasks can
run that repository's hooks. So pointing `way` at a repository you did not
write runs its code, before you have run anything from the list.

`allowExec` alone cannot gate that. `wayfinder.config.json` lives inside the
repository, so a setting it could raise is a setting the repository could
grant itself. Instead `way` asks a person once per repository and stores the
answer outside it. That record is trust.

The built-in runners that must run their tool to be read are `moon`, `mise`
and `sbt`. `way providers` shows each tool's kind. An exec runner is reported
only when its tool is detected in the repository, and it is withheld until
the repository is trusted.

## The gate

Execution needs `allowExec` on and a trusted repository:

| Flag        | Configured | Trusted | Execution | Reason            |
| ----------- | ---------- | ------- | --------- | ----------------- |
| `--no-exec` | any        | any     | no        | `configured-off`  |
| `--exec`    | any        | any     | yes       | `allowed-by-flag` |
| (none)      | `false`    | any     | no        | `configured-off`  |
| (none)      | `true`     | no      | no        | `untrusted`       |
| (none)      | `true`     | yes     | yes       | `allowed`         |

`--no-exec` does not read the trust store at all.

`--exec` never writes the store. It is consent for one run, which is what
scripts and CI want.

For how the configured value is settled, see
[Configuration](configuration.md#allowexec). wayfinder's default is `true`, so
trust alone is enough unless a config file sets `allowExec: false`.

## Trusting a repository

```text
way trust             trust the repository at the resolved root
way trust --untrust   remove this repository's trust
way trust --show      report this root's trust status
way trust --list      every trusted path, one per line
way trust --json      the same answer as one JSON object
way trust -C PATH     the directory to inspect (default: cwd)
```

`--json` combines with each mode. The three root modes print
`{"root": …, "trusted": …, "changed": …, "by": …, "rule": …}`. `--list`
prints `{"trusted": [paths]}`. `by` is `"marker"`, `"path"`, `"owner"` or
`null`: the layer that decided. `rule` is the matching `trust.paths` or
`trust.owners` entry, present only when `by` is `"path"` or `"owner"`.

Giving two mode flags is a usage error. Trusting an already-trusted
repository says so and changes nothing. `--untrust` on a root that was not
trusted exits 1. `--show` exits 0 either way.

Trust, with execution allowed, also lets the `tools` named in the project
file load. See
[Extending](extending.md).

The terminal UI grants trust with `Ctrl+S`, after a `y`/`n` question. The
web view offers a **Trust this repository** button. Both are offered only
when trust is what is missing.

When runners are withheld for lack of trust, `--list` and `--json` print a
line on stderr, the terminal UI shows `N hidden — repo not trusted (^s to
trust)`, and the web view shows the button in a bar above the list, in each
withheld runner's info panel and in the runner picker.

## The policy

A root can also be trusted without a marker, through a `trust` block in the
user config file:

```jsonc
// ~/.config/wayfinder/config.json
{
  "trust": {
    "paths": ["/home/me/work/**"], // a glob over the resolved root
    "owners": ["my-org", "gitlab.com/other-org"], // origin remote owners; bare means github.com
  },
}
```

The project file cannot do this. A project file's `trust` block is dropped
with a warning, for the same reason a project file cannot raise `allowExec`.

Trust is decided in order: a marker in the store, then `trust.paths`, then
`trust.owners`. The decision comes from `@osdlc/trust-repo`, whose README
documents the glob dialect: `*`, `?`, `**`, and a trailing `/**` that does not
match the directory itself. wayfinder expands a leading `~` in a `trust.paths`
entry against `$HOME`.

`trust.owners` reads the host and owner from the `origin` remote URL in the
local `.git/config`. An entry is `host/owner` (`gitlab.com/my-org`) or a bare
`owner`, which means `github.com/owner`. Both the host and the owner must
match, ignoring case, so `my-org` does not trust a clone from
`gitlab.com/my-org`. Nothing verifies that file, so this trusts whoever a
repository was cloned from, not who wrote it. Prefer `trust.paths` for
repositories you keep under one directory. The lookup ignores `GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR` and the `GIT_CONFIG_*`
variables that rewrite config for one command.

`way trust --show` reports which layer decided. The plain `way trust` still
writes a marker on a policy-trusted root, because a policy can change.
`--untrust` says when the policy still covers the root after the marker is
gone.

## What a decision is keyed on

The absolute, symlink-resolved repository root. Two paths that name one
repository, such as a symlinked checkout, are one decision.

The key is a path, not a hash of the contents. A repository you trusted that
later pulls hostile changes stays trusted, and `way trust --untrust` is the
remedy. Hashing every runner config would re-prompt on ordinary edits, which
trains people to approve without reading.

## Where the store lives

`$XDG_STATE_HOME/wayfinder/trusted/`, or `~/.local/state/wayfinder/trusted/`
when that variable is unset. It is XDG state, not config, so consent does
not travel with a dotfiles repository to a new machine. XDG paths are used on
every platform, macOS included.

Grants made under the old name, in `$XDG_STATE_HOME/waypost/trusted/`, still
count. `way trust` writes new grants to the wayfinder store. `way trust
--untrust` and `way clean --trust` remove a grant from both stores.

The store is a directory of marker files, one per trusted root. A marker is
named `<basename>-<first 16 hex digits of sha256(root)>` and holds the
resolved path. Writes are atomic, so a partial write is never read as a
grant.

## The cache is not the trust store

Stored probe results live under `$XDG_CACHE_HOME/wayfinder/`, apart from the
trust store. See [The cache](cache.md).

- A cached answer is never a trust grant. The gate is resolved fresh on every
  run.
- Clearing the cache does not change what is trusted.
- A runner withheld for lack of trust is never stored.

## Removing what is stored

Three things live outside your repositories: the cache, the trust store and
your user config file. `way clean` removes them.

```text
way clean                  show each store, where it is, and what it holds
way clean --cache          remove stored probe results
way clean --trust          forget which repositories you have trusted
way clean --config --yes   remove your user configuration file
way clean --all --yes      all three
way clean --json           the same answer as one JSON object
```

Bare `way clean` reports and removes nothing. `--config` and `--all` need
`--yes`, because the config file is the only one you wrote by hand.

| Store  | What losing it costs                                |
| ------ | --------------------------------------------------- |
| cache  | one slow probe                                      |
| trust  | answering the trust question again, per repository  |
| config | everything in it                                    |

`--json` prints a `stores` array of `{key, flag, what, path, bytes, removed}`.
`bytes` is `null` when nothing was stored.

Nothing inside a repository is touched. A project's `wayfinder.config.json`
belongs to that project.
