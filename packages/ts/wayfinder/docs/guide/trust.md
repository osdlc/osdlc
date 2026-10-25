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
way trust                 trust the repository at the resolved root
way trust --untrust       remove this repository's whole-repository grant
way trust --untrust-all   remove every grant of this repository
way trust --show          report this root's trust and what decided it
way trust --list          every grant, one per line
way trust --scope <tool>  with a mode above: one tool's grant, such as mise
way trust --json          the same answer as one JSON object
way trust -C PATH         the directory to inspect (default: cwd)
```

`--json` combines with each mode and prints
`{"action": …, "changed": …, "roots": [{"root": …, "trusted": …, "by": …, "rule": …, "scope": …}]}`.
`--list` gives one entry per grant. `by` is `"marker"`, `"path"`, `"owner"`
or `null`: the layer that decided. `rule` is the matching policy entry,
present only when `by` is `"path"` or `"owner"`. `scope` is present for a
one-tool grant.

Giving two mode flags is a usage error. Trusting an already-trusted
repository says so and changes nothing. `--untrust` on a root that was not
trusted exits 1. `--show` exits 0 either way.

A grant is made from the command line only. The web view can show and list
trust, and its server refuses a grant.

### One tool's trust

A run needs every tool it runs trusted. A mise task needs mise trusted, for
example. `way trust --scope mise` trusts mise alone in this repository and
leaves the rest untrusted. `--untrust --scope mise` removes that grant only.
`*` is the whole-repository scope and cannot be named with `--scope`.

Trust, with execution allowed, also lets the `tools` named in the project
file load. See
[Extending](extending.md).

The terminal UI grants trust with `Ctrl+S`, after a `y`/`n` question. The
web view offers a **Trust this repository** button. Both are offered only
when trust is what is missing.

When runners are withheld for lack of trust, `list` and `list --json` print a
line on stderr, the terminal UI shows `2 runners withheld: this repository is
not trusted (^s to trust)`, and the web view shows the button in a bar above the list, in each
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
    "tools": {
      "mise": { "paths": ["/home/me/scratch/**"] }, // mise only, under this path
    },
  },
}
```

`trust.tools.<tool>` takes the same `paths` and `owners`. It trusts that one
tool, as `way trust --scope <tool>` does, and nothing else.

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
`gitlab.com/my-org`. Nothing verifies that file. It comes with the
directory, so a folder unpacked from an archive, copied from a shared drive or
cloned by someone else can name any owner, directly or through an
`insteadOf` rewrite in the same file. Owner trust fits clones you made
yourself, and even then it trusts whoever a repository was cloned from, not
who wrote it. `trust.paths` is the stronger form: a repository cannot choose
where it sits on your disk. Prefer it for repositories you keep under one
directory. The lookup ignores `GIT_DIR`,
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
when that variable is unset. `WAYFINDER_ROOT` moves it, with the other
directories. See [Paths](configuration.md#paths). It is state, not config,
so consent does not travel with a dotfiles repository to a new machine. XDG
paths are used on every platform, macOS included.

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

`way clean` reports and removes what wayfinder stores outside your
repositories.

```text
way clean                      show each store, where it is, and what it holds
way clean --cache              remove stored probe results
way clean --trust              forget which repositories you have trusted
way clean --user-config --yes  remove your user configuration file
way clean --dev                remove way dev link state and the shims way dev install wrote
way clean --legacy             remove files left under the tool's name before its first release
way clean --everything --yes   every store above
way clean --json               the same answer as one JSON object
```

Bare `way clean` reports and removes nothing. `--user-config` and `--everything`
need `--yes`, because the config file is the only one you wrote by hand. A
config file that `WAYFINDER_CONFIG` names is labelled with the variable in the
report, in the `--yes` refusal and again before it is removed. `--dev` removes
only shims that carry devlink's marker line, so a file of your own with the
same name is kept. `--dev` and `--legacy` stores appear in the report only
when something is there.

Once a store is removed, the empty directories above it are removed too, up
to the base directory such as `~/.config`.

| Store  | What losing it costs                                |
| ------ | --------------------------------------------------- |
| cache  | one slow probe                                      |
| trust  | answering the trust question again, per repository  |
| config | everything in it                                    |
| dev    | running `way dev install` again                     |
| legacy | nothing: wayfinder does not read these files        |

`--json` prints `{mode, stores}`. `mode` is `report` or `remove`. Each store is
`{key, flag, what, path, bytes, removed, envVar}`. `bytes` is `null` when
nothing was stored. `envVar` is present when a variable named the path.

Removing is a command-line action: the web view's server gets the report
only. A store that cannot be removed stops the run with exit 1.

Nothing inside a repository is touched. A project's `wayfinder.config.json`
belongs to that project.
