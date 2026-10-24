---
title: Getting started
sidebar:
  order: 1
description: Install way, run it, and pick one of its four surfaces.
---

wayfinder lists every task the tools in a repository already define, in one
searchable list. moon, just, package.json scripts, make, cargo and the rest
appear side by side. In the terminal UI, Enter runs the selected task.

Detection and collection come from `@osdlc/system-model`. wayfinder is the part
you look at.

## Install

```sh
npm i -g @osdlc/wayfinder
```

pnpm and bun work too (`pnpm add -g @osdlc/wayfinder`, `bun add -g @osdlc/wayfinder`).
The package installs one command, `way`. It has no library API.

wayfinder runs on Node 22.22 or later on the 22 line, or Node 24.15 or later.
Bun can also run it.

## Run it

With no arguments, `way` inspects the current directory and opens the
terminal UI:

```sh
way
```

The directory is resolved upward to the project root. Running from a
subdirectory still inspects the whole repository.

## Four surfaces

```sh
way                  # the terminal UI; Enter runs the selected task
way query <terms>    # the tasks matching a search, best match first
way --serve          # the same catalog as a live page
way --json | --list  # the whole catalog, for a script or an agent
```

- **The terminal UI** is the interactive browser. See
  [The terminal UI](terminal-ui.md).
- **`--serve`** opens a live page over the same catalog. See
  [The web view](web-view.mdx).
- **`query`** is the terminal UI's search without the UI. It ranks the catalog
  with the same matcher and prints one command line per match. Terms are ANDed
  and matched fuzzily. A leading `'` makes one term match exactly, and
  `--exact` does that for every term. `--services` keeps only tasks that run
  until you stop them. `--json` prints the matching tasks instead of their
  command lines. A search that matched nothing exits 1, so `way query dev && …`
  works in a script.
- **`--json`** prints the whole catalog as JSON. `--list` prints one command
  per line. Both re-probe on every run. `--cached` answers them from the last
  stored probe instead. See [The task model and JSON](task-model.md) and
  [The cache](cache.md).

## Rows come in groups

Every surface shows four groups of rows:

- **Tasks**, from runners such as moon, just and make.
- **Dependencies**: installs and frozen installs, from the package managers
  found.
- **Tools**: `mise install`, `mise trust`, `direnv allow` and the like, from
  the tool managers found.
- **Git hooks**: arming the hooks, and each hook as a task you can run by
  hand, from lefthook, husky or pre-commit.

Every row is a task, so search, run and arguments work the same for all of
them. The tab bars in the terminal UI and the web view show where one group
ends and the next begins. `--json` carries a `groups` array.

## Options

```text
--serve             a live page in the browser instead of the terminal UI
--json              print the catalog and exit, no UI; with query, the
                    matching tasks themselves
--list              print one command line per task and exit; with query, the
                    default form
--port <N>          fixed port for --serve (default: an OS-assigned one)
--no-open           print the URL rather than opening a browser
--cached            answer --json/--list from the last stored probe
--exact             with query: terms match as substrings, not subsequences
--services          with query: only tasks that run until you stop them
--exec              allow runners that must run a subprocess, this run only
--no-exec           skip them, overriding a configured allowExec: true
--only <a,b>        restrict to these runners
--exclude <a,b>     skip these runners, replacing the configured
                    runners.disabled
--exclude-path <P>  skip a path; repeatable
--discovery <M>     git | walk | auto (default: auto)
-C, --dir <PATH>    the directory to inspect (default: cwd)
--config <MODULE>   load extra tools from a module, this run only; repeatable
-h, --help          the short form
--help --all        every flag, the defaults and the notes
```

## Subcommands

```text
config     read and write the layered settings file
trust      allow this repository's runners to be read by running them
providers  the registered tools, built-in and your own
guide      how to use and extend this tool, in Markdown
clean      remove the data this tool stores outside your repositories
dev        run the installed way from a development checkout
```

Each takes `--help`. A subcommand is claimed before the flag parse, so its
arguments are not read as top-level flags. `config`, `trust` and `providers`
take `-C`.

`way --help` prints the short form. `way --help --all` prints every flag.
`way guide` is the long form, by topic: `usage`, `config`, `json`, `trust` and
`extend`. A usage error prints the short form.

## Execution needs trust

Some runners can only be read by running them. moon reads its task graph by
running `moon query`, which evaluates the repository's own toolchain
configuration. wayfinder is willing to do that by default. The repository must
also be trusted, once:

```sh
way trust
```

Until then those runners are withheld and every surface says so. `--exec`
allows them for one run and records nothing. `--no-exec` forbids them however
trusted the repository is. See [Trust and execution](trust.md) and
[Configuration](configuration.md).

`way providers` lists every registered tool, its roles, and whether its
runner is `parse` (reads files) or `exec` (runs the tool).
