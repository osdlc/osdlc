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
The package installs one command, `way`. It also exports a small library:
`buildCatalog` and friends from the root entry, and the document schemas from
`@osdlc/wayfinder/schema` (see the README's Library section).

wayfinder runs on Node 22.22.2 or later on the 22 line, 24.15.0 or later on
the 24 line, or Node 26 and later (Node 25 is not supported).
Bun can also run it.

## Run it

With no arguments, `way` inspects the current directory and opens the
terminal UI:

```sh
way
```

The directory is resolved upward to the project root. Running from a
subdirectory still inspects the whole repository.

## The commands

```sh
way                  # the terminal UI; Enter runs the selected task
way query <terms>    # the tasks matching a search, best match first
way run <id>         # run one task by its id or command line
way serve            # the same catalog as a live page
way list [--json]    # the whole catalog, for a script or an agent
way help             # every command; way schema <command> for its JSON Schema
```

`way --serve`, `way --list` and `way --json` still work in this release, as
aliases for `way serve`, `way list` and `way list --json`.

- **The terminal UI** is the interactive browser. See
  [The terminal UI](terminal-ui.md).
- **`serve`** opens a live page over the same catalog. See
  [The web view](web-view.mdx).
- **`query`** is the terminal UI's search without the UI. It ranks the catalog
  with the same matcher and prints one command line per match. Terms are ANDed
  and matched fuzzily. A leading `'` makes one term match exactly, and
  `--exact` does that for every term. `--services` keeps only tasks that run
  until you stop them. `--json` prints the matching tasks instead of their
  command lines. A search that matched nothing exits 1, so `way query dev && …`
  works in a script.
- **`run`** runs one task, given its `id` or a command line only one task
  has, and exits with the task's exit code. Arguments after `--` are bound
  the way the tool expects. `--dry-run --json` prints what it would run.
- **`list`** prints one command
  per line, with any control character in repository text replaced by
  U+FFFD; `list --json` prints the whole catalog, with the text kept exact, as `\u`
  escapes where needed. `list` and `query` re-probe on every run. `--cached`
  answers them from the last saved listing instead, without checking files. Both take `--services`,
  `--declared` and `--depth N`. See [The task model and JSON](task-model.md) and
  [The cache](cache.md).

## Rows come in groups

Every surface shows four groups of task rows, plus a fifth when the
repository has agent skills:

- **Tasks**, from runners such as moon, just and make.
- **Dependencies**: installs and frozen installs, from the package managers
  found.
- **Tools**: `mise install`, `mise trust`, `direnv allow` and the like, from
  the tool managers found.
- **Git hooks**: arming the hooks, and each hook as a task you can run by
  hand, from lefthook, husky or pre-commit.
- **Skills**: the repository's agent skills. These rows are not tasks: they
  sit in a separate `skills` array, and Run copies `/<name>` instead of
  spawning anything.

Every row in the first four groups is a task, so search, run and arguments
work the same for all of them. The tab bars in the terminal UI and the web view show where one group
ends and the next begins. `--json` carries a `groups` array.

## Options

```text
--json              with list, query, run --dry-run or providers: print the
                    command's document
--cached            with list, query or run: answer from the last saved listing
--exact             with query: terms match as substrings, not subsequences
--services          with list or query: only tasks that run until you stop them
--declared          with list or query: only tasks a file declares
--depth <N>         with list or query: only tasks at most N directories deep
--port <N>          with serve: a fixed port (default: an OS-assigned one)
--no-open           with serve: print the URL rather than opening a browser
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

Each takes `--help`. A command word is found after the global flags, so
`way -C ../app trust --show` works. `config`, `trust` and `providers` take
`-C`.

`way help` prints the commands. `way --help --all` prints every flag.
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
