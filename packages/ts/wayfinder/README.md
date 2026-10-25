# @osdlc/wayfinder

Browse and run every task in a repository from one list: package.json
scripts, just, make, cargo, moon, mise and the rest, plus the install, tool and
git-hook commands your package managers and tool managers imply.

```sh
way               # the terminal UI; Enter runs the selected task
way --serve       # the same catalog as a live page
way query dev     # the tasks matching a search, best match first
way --json        # the data, for anything else
way providers     # every tool it knows, and whether its binary is on PATH
```

It is for people who move between repositories and do not want to learn each
one's task runner before they can start it, and for scripts and agents that
need the same answer as data.

Finding and reading the tools is done by
[`@osdlc/system-model`](https://www.npmjs.com/package/@osdlc/system-model).
This package is the part you look at.

## Install

```sh
npm install --global @osdlc/wayfinder
```

This puts `way` on your PATH. `pnpm add --global` and `bun add --global` work
too. ESM only.

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of its dependency
`@osdlc/typed-git`. Bun can also run it.

## Running from a checkout

An installed `way` can run the source of a checkout instead, through
[`@osdlc/cli-tool/devlink`](https://www.npmjs.com/package/@osdlc/cli-tool).
`way dev link` makes one checkout the one every `way` on the machine runs, and
`WAY_HOME` names one for a shell. Every link is remembered. `way dev` is a
contributor tool, so `way --help` does not list it.

```sh
way dev install          # once: put shims for this checkout on PATH as way and wayfinder
way dev link             # this checkout answers everywhere, until told otherwise
way dev history          # every checkout ever linked, most recent first, with branch and HEAD
way dev use #2           # back to an earlier one …
way dev use canonical    # … or to the install itself
way dev status           # which checkout runs now, and why
```

The first match wins, in this order: `WAY_HOME`, the linked checkout, then the
install. `way` never picks a checkout from the cwd, so a repository you run it
in cannot choose the code that runs. A checkout must hold `src/cli.ts` and a
`package.json` named `@osdlc/wayfinder`; anything else is skipped. The shim
prints which one it chose on stderr, and `WAY_QUIET=1` silences it. State
is kept in `<config>/way/`, which is `~/Library/Application Support/way` on
macOS and `${XDG_CONFIG_HOME:-~/.config}/way` elsewhere. A checkout runs from
source, so it needs [Bun](https://bun.sh) on PATH and a `pnpm install` in the
checkout.

## Why

A repository of any size runs its work through several tools at once, and each
answers only for itself. `just --list` shows recipes. `moon query tasks` shows
moon tasks. Neither helps when the question is "how do I start that app" and you
do not yet know which tool owns it.

`wayfinder` puts all of them in one searchable list. Each row shows the command
you would type, and in the terminal UI, Enter runs it.

## Groups

Rows come in four groups, in this order, on every surface:

| Group | What fills it | Example rows |
| --- | --- | --- |
| Tasks | task runners: scripts, recipes, targets | `npm run dev`, `just deploy` |
| Dependencies | the detected package managers | `npm ci`, `cargo fetch` |
| Tools | tool managers such as mise and proto | `mise install` |
| Git hooks | lefthook, husky, pre-commit | `lefthook install` |

The terminal UI and the page show a break between groups in the tab bar.
`--json` adds a `groups` array: `{id, title, runners}` for each group that has
rows. `runners.order` reorders runners within a group; the groups keep their
order.

## The terminal UI

```text
enter  run the selected task, handing it this terminal
       (a task with parameters asks for them first)
^y     copy its command
tab    next runner (all · just · node-scripts │ dependencies │ tools …)
^e     exact search instead of fuzzy
^t     only services — tasks that run until you stop them
^s     trust this repository, when runners are hidden for want of it
^r     re-probe (always a real probe, never the store)
,      this project's configuration, read-only
esc    quit
```

`^s` asks first. The status line becomes `trust this repository? y/n`, and
only `y` records a grant. A single key press should not decide whether this
repository's code may run.

A recipe that takes arguments asks for them first. Enter on
`just deploy <env>` turns the key line into a command line, with the command
already on it and the cursor after it. Type `staging` and press Enter to run
`just deploy staging`, or press `esc` to go back. A task with no arguments
runs as soon as you press Enter.

Fuzzy by default. Terms are ANDed, so `photo dev` narrows to a photo app's dev
server. A leading `'` forces one term to match exactly.

To start an app: press `^t`, type the app's name, then press Enter.

The command Enter will run is always shown above the key line. Tasks are
spawned from an argument list, never through a shell, so a shell cannot
reinterpret a recipe that has `<placeholders>`.

## Searching from the shell

`way query <terms>` is the terminal UI's search without the UI: the same
matcher, the same ranking, one command line per match.

```text
way query dev             every task matching "dev", best match first
way query photo dev       terms are ANDed
way query dev --exact     every term matches as a substring, not a subsequence
way query --services      only tasks that run until you stop them
way query dev --json      the matching tasks, rather than their command lines
```

A leading `'` forces one term to match exactly, as it does in the UI. A search
that matches nothing exits 1, so `way query dev && …` works in a script. A bare
`way query` matches everything, the same as `way --list`. Every collection
flag applies (`-C`, `--only`, `--exclude`, `--cached` and the rest). Like
`--list` and `--json`, it re-probes unless you pass `--cached`.

## The web view

`way --serve` opens a page with the same catalog: a collapsible tree by call
chain, sticky group headers, fuzzy and exact search, and copy buttons.

It is a server, not a generated file, on purpose. A file goes out of date as
soon as you add a task. The server re-probes, and the page refreshes when it
gets focus and on a slow poll, so it shows what the repository has now.

The first request is answered from the [stored probe](#the-cache) while a real
probe runs in the background. So the page appears at once, even when the
slowest runner takes seconds. The rows update in place when the probe
finishes. Refresh always runs a real probe.

## Execution, and trust

Some runners can only be read by running them. `moon query tasks` evaluates the
repository's own toolchain configuration, and `mise tasks` can run its
`[hooks]`. So opening a task browser on a repository you did not write runs
that repository's code, even if you run no task.

`wayfinder`'s `allowExec` default is `true`. You usually open a task browser in
your own repository, and one that cannot see the build graph is of little use.
But `allowExec` alone does not allow execution. The repository must also be
trusted. You grant trust once per repository, and it is remembered:

```text
way trust                 trust the repository at the resolved root
way trust --untrust       remove this repository's trust
way trust --show          report this root's trust status
way trust --list          every trusted path, one per line
way trust --json          the same answer as one JSON object
way trust --help          this list
```

Each mode also has a JSON form, and `--json` prints one object per run. The
three modes that act on the root (the plain grant, `--untrust` and `--show`)
all print `{"root": …, "trusted": …, "changed": …, "by": …, "rule": …}`, so a
caller does not have to branch on the flag it passed. `--list` prints
`{"trusted": [paths]}`. `by` is `"marker" | "path" | "owner" | null` and names
the layer that decided (see [The policy](#the-policy) below). `rule` is the
matching `trust.paths` or `trust.owners` entry, present only when `by` is
`"path"` or `"owner"`. A `--untrust` that finds no marker to remove still
prints its object, and reports the miss with exit 1 and a line on stderr. So a
parser never gets an empty stdout.

`-C` applies here too. Trust, with execution allowed, also lets the project
file load tool modules; see
[Adding your own tools](#adding-your-own-tools).

### The policy

A root can also be trusted without a marker, through a `trust` block in the
user config file. The project file cannot hold one: a repository cannot grant
itself trust, just as it cannot set `allowExec: true`.

```jsonc
// ~/.config/wayfinder/config.json
{
  "trust": {
    "paths": ["/home/me/work/**"], // @osdlc/trust-repo's glob dialect
    "owners": ["my-org"] // case-insensitive `origin` remote owners
  }
}
```

`@osdlc/trust-repo`'s `policyExecGate` checks, in order: a marker in the
store, then `trust.paths` (a glob over the root, with symlinks resolved), then
`trust.owners` (the owner in the `origin` remote's URL, which wayfinder asks
git for). `@osdlc/trust-repo`'s README documents the order and the glob
dialect. wayfinder adds only one thing: a leading `~` in a `trust.paths` entry
expands to `$HOME`. An owner match trusts every repository whose remote names
that owner, so list only owners whose repositories you would run.

`way trust --show` reports which layer decided (`by` and `rule`). A plain
`way trust` still writes a marker on a root the policy already trusts, because
the policy can change later and the marker stays. `--untrust` tells you when
the policy still covers the root after the marker is removed.

### Removing what it has stored

wayfinder stores three things outside your repositories, and `way clean`
removes them. Bare `way clean` only reports them, so it deletes nothing by
default.

```text
way clean                  show each store, where it is, and what it holds
way clean --cache          stored probe results
way clean --trust          forget which repositories you have trusted
way clean --config --yes   your user configuration file
way clean --all --yes      all three
way clean --json           the same answer as one JSON object
```

`--json` prints one object with a `stores` array of
`{key, flag, what, path, bytes, removed}`. A bare report lists every store. A
removal lists only the ones you named. `bytes` is null when nothing was stored.
That tells "nothing to remove" apart from "could not remove", since both have
`removed: false`. Under `--json`, the closing note that trust will be asked for
again goes to stderr, so stdout stays one JSON document.

`--config` and `--all` need `--yes` because the three stores are not equally
easy to replace. The cache is rebuilt by one slow probe. Losing trust means
answering the trust question again for each repository. The configuration is
the only one you wrote by hand. `clean` never touches anything inside a
repository: a project's own `wayfinder.config.json` belongs to that project.

The trust store is a directory of marker files at
`$XDG_STATE_HOME/wayfinder/trusted/`, or `~/.local/state/wayfinder/trusted/`
when that variable is unset. It is XDG state, not config. The program
maintains trust, and a person does not edit it by hand. A consent record
copied to a new machine in a dotfiles repository is no longer consent. Grants
made under the old waypost name, in `~/.local/state/waypost/trusted/`, still
count.

**A repository cannot trust itself.** `allowExec: true` in
`wayfinder.config.json` is ignored with a warning, because that file lives
inside the repository being scanned. The project file may still lower
`allowExec` to `false`. A `trust` block in the project file is ignored with a
warning too. Unlike `allowExec`, trust has no lower setting a repository could
choose.

`--exec` allows execution for one run and records nothing, which suits a
script or a CI job. `--no-exec` turns execution off, however trusted the
repository is. Both flags apply on every surface, including the web view. Its
`POST /api/trust` returns `409` whenever a grant would have no effect, so the
page cannot lift `--no-exec` or make an `--exec` run permanent. The page hides
its trust button in those states, and the server refuses the request anyway.
The session token proves who is asking, not that the request makes sense.

When runners are withheld, every surface says so and offers a way to grant
trust. `--list` and `--json` print one line on stderr. The terminal UI shows
`N hidden — repo not trusted (^s to trust)` beside the counts. The web view
shows a **Trust this repository** button in a bar above the list, in each
withheld runner's info panel and in the runner picker.

### What decides

`configured` is `allowExec` after the layers and wayfinder's own `true` default.

| configured `allowExec` | trusted | flag | effective | why |
| --- | --- | --- | --- | --- |
| any | any | `--no-exec` | `false` | the flag is the last word, and the store is not even read |
| any | any | `--exec` | `true` | consent for this run, typed by a person; nothing is recorded |
| `false` | any | none | `false` | a file said no; trusting the repository would change nothing |
| `true` | no | none | `false` | willing in principle, but this repository has not been trusted |
| `true` | yes | none | `true` | the only combination that runs a subprocess |

Trust is keyed on the repository's absolute path, with symlinks resolved, not
on a hash of its contents. mise makes the same tradeoff. A trusted repository
that later pulls hostile changes stays trusted, and `way trust --untrust` is
the only remedy. Hashing every runner config instead would ask again after
ordinary edits, and people would learn to approve without reading.

## The cache

Some runners are slow to ask (moon starts its toolchain, sbt starts a JVM),
and a browser that waits for them looks broken. `wayfinder` stores the last
answer for each root and runner, so the UI can show rows at once.

The terminal UI and `--serve` always start from the store. They read it, show
the rows, then probe in the background and update in place. `--json` and
`--list` re-probe on every run, because a script or an agent reading them needs
what the repository has right now. Those runs also write the store, so the next
UI start is instant. `--cached` makes `--json` and `--list` read the store for
one run.

A stored answer is in one of three states, and every surface shows them the
same way:

- **Fresh** — the stored answer still holds, and nothing is said.
- **Stale** — the answer was used and is out of date. The terminal UI marks the
  runner's tab with a leading `~` and notes `cached rows — re-probing just
  (~149ms)` beside the counts, or `cached rows: just 35s old — ^r to re-probe`
  once the refresh is over and the rows are still the stored ones; the page
  shows `cached: just 35s old - re-probing`.
- **Stale and slow to probe here** — the case the cache exists for. It is
  shown in red, to set it apart from a 200ms refresh:
  `cached rows — moon (~2.4s) is slow to probe here, so this takes a moment`.

Slowness is measured in this repository: the median of the last five probe
durations. A runner that is quick here is never called slow because it is slow
elsewhere. When a repository has no measurement yet, the surface says so
instead of guessing a number.

`^r` in the terminal UI and Refresh on the page always run a real probe. They
never answer from the store.

If you run a row whose task no longer exists, such as a task renamed since the
stored probe, both surfaces tell you the row came from the store, instead of
showing only a spawn failure.

For the pipeable surfaces, `--cached` names the stale runners on stderr, so
`--list` stays pipeable and `--json` stays parseable:

```text
wayfinder: --cached: stale: just (35s old, refresh usually about 149ms)
wayfinder: --cached: not cached, probed now: github-actions
```

`--cached` with an empty store is not an error. It probes, stores the result,
and says so. `--json --cached` adds a `cache` array beside the catalog, with
one entry per selected runner. Over HTTP the page always receives this array.

The cache is at `$XDG_CACHE_HOME/wayfinder/`, or `~/.cache/wayfinder/`. It is
XDG cache, not the `~/.local/state/wayfinder/` directory that
[trust](#execution-and-trust) uses. Losing the cache costs one slow probe.
Losing the trust store would silently un-trust repositories. The cache plays no
part in deciding execution. A cached answer is never a trust grant, clearing
the cache never changes what is trusted, and a runner withheld for lack of
trust is never stored. A stored answer is invalidated by a content hash over
the files its probe read, never by mtime. The
[`@osdlc/system-model` README](https://www.npmjs.com/package/@osdlc/system-model)
describes the limits of this.

## Configuration

Options you would otherwise type on every run can live in a file: which
runners to skip, what order to show them in, whether execution is allowed, and
how files are discovered. The layers, lowest precedence first: built-in
defaults, `$XDG_CONFIG_HOME/wayfinder/config.json` (or
`~/.config/wayfinder/config.json`), `wayfinder.config.json` at the project
root, then the flags on the command line.

The keys are `runners.disabled`, `runners.order`, `allowExec`, `discovery`,
`excludePaths`, `trust.paths`, `trust.owners` and `tools`. `WAYFINDER_CONFIG`
names a different user file and changes nothing else.

The tool was called waypost before its first release. `WAYPOST_CONFIG`,
`~/.config/waypost/config.json` and `waypost.config.json` are still read when
the new name is absent, with a warning. See the
[configuration guide](docs/guide/configuration.md#files-from-the-waypost-name).

```text
way config list [--json]                          every setting, and the layer it came from
way config get <key>                              one setting's effective value, as JSON
way config set <key> <value> [--user|--project]   write a setting (default --project)
way config unset <key> [--user|--project]         remove a setting (default --project)
way config path                                   where each layer's file lives
way config --help                                 this list
```

`-C` applies here too, so `way config path -C /elsewhere` reports that
directory's files rather than this one's. Exit code 2 means the command as
typed cannot run, such as an unknown key or a value of the wrong type. Exit
code 1 means the command was valid but failed against the state it found.

`runners.order` sets the runner order everywhere: `--json`, `--list`, the
terminal UI's tab order, and the web view. In the web view, an order you set by
dragging is saved in the browser and overrides it.

### `allowExec` here

wayfinder's execution default is `true`, and any file overrides it. Highest
precedence first:

1. `--exec` or `--no-exec` on this command line
2. `allowExec: false` in `wayfinder.config.json`, then `allowExec` in the user file
3. wayfinder's own default, `true`

A file has to say `false` for execution to be off. `way config list` and
`way config get allowExec` report that default, labelled `(default)`.

This setting alone does not allow execution. The repository must also be
[trusted](#execution-and-trust), so with `true` here, runners that must run to
be read are still skipped until then.

## Options

```text
query <terms>        the tasks matching a search, best match first
--exact              with query: terms match as substrings, not subsequences
--services           with query: only tasks that run until you stop them
--serve              a page instead of the terminal UI
--port N             fixed port for --serve
--no-open            print the URL rather than opening a browser
--json | --list      print the catalog and exit
--cached             answer those two from the last stored probe

--no-exec            skip runners that must run a subprocess
--exec               allow them for this run only, without recording trust
--only a,b           restrict to these runners
--exclude a,b        skip these runners
--exclude-path P     leave a path out of discovery; repeatable. A bare name
                     matches any path segment, a value with a slash matches a
                     path from the root and takes the tree beneath it
--discovery M        git | walk | auto (default: auto)
-C, --dir PATH       directory to inspect (default: cwd)
--config MODULE      load extra tools from a module, this run only; repeatable
-h, --help           the short form: the ways in, and where the rest is
--help --all         the block above, every default and every note

config               read and write the layered settings; `config --help`
trust                allow this repository's runners to be read by running
                     them; `trust --help`
providers            the registered tools, built-in and your own;
                     `providers --help`
clean                remove what this tool has stored; `clean --help`
guide                how to use and extend this tool, in Markdown
```

A subcommand is matched before flags are parsed, so the flags above belong to
the top-level command, not to the subcommands. `-C` is the exception. The
subcommands whose answer depends on the repository take it.

| Subcommand | `-C, --dir` | Why |
|---|---|---|
| `config` | yes | reports the configuration THAT directory resolves |
| `trust` | yes | the grant keys on that directory's project root |
| `providers` | yes | a trusted project file can add tools when execution is allowed |
| `clean` | no | resolves every path from the environment and the home directory |
| `guide` | no | its argument is a topic name |
| `dev` | no | its state is devlink's, keyed on the tool name; not listed in the help |

`way --help` is the short form: the main ways to run it, the flags most runs
pass, and the names of the subcommands. `way --help --all` is the full flag
list shown above. Each subcommand has its own `--help`. `way guide` is the long
form, by topic. A usage error, such as a mistyped flag, prints the short form,
so the error is not lost in the full list.

`way guide` prints instructions on using and extending the tool, for people
and for agents. `way guide extend` covers adding a tool, and `way guide trust`
covers when runners may run.

The directory is resolved upward to the project root, so running from a
subdirectory still inspects the whole repository.

## Adding your own tools

A tool is a `ToolDef` from `@osdlc/system-model/detect`, the same shape as the
built-ins. A module that exports `tools`, an array of them, can be loaded three
ways:

```sh
way --config ./acme-tools.ts --list                  # this run only
way config set --user tools '["~/acme-tools.mjs"]'   # every run, from your user file
way config set tools '["./tools/acme.mjs"]'          # this repository, once trusted with exec on
```

A module is code, so where it is named decides whether it loads. `--config`
and the user file always load. The project file loads only when the
repository is trusted and execution is allowed (`allowExec` not `false`, no
`--no-exec`); otherwise wayfinder prints a warning and loads nothing from it.
`way guide extend` prints a complete example. A tool's runner may define
`invoke(task, args)` to say where typed arguments go, such as after `--` for
`npm run`. By default they are appended.

`way providers` lists every registered tool: its roles, its runner kind
(`parse` reads files, `exec` must run the tool and needs trust), its binary,
whether that binary is on PATH, and whether it is built in or custom.
`--json` gives the same rows as data.

## How it compares

- **Each tool's own list** (`just --list`, `npm run`, `moon query tasks`)
  answers for one tool. wayfinder asks all of them and shows one list.
- **[fzf-make](https://github.com/kyu08/fzf-make)** is a fuzzy picker for
  make, npm, pnpm, yarn, just and task targets, shipped as a Rust binary.
- **[runpalette](https://github.com/Adam014/runpalette)** is a Node CLI with
  one list of package.json, justfile, Taskfile, Makefile, Cargo and Gradle
  commands.
- wayfinder covers more runners (moon, mise, docker-compose, GitHub Actions and
  others), adds the install and hook commands, has a web view and JSON output,
  caches slow runners, and withholds runners that execute code until the
  repository is trusted.

## Platforms

Tested on Linux and macOS. Windows is untested: running tasks and opening the
browser assume a POSIX environment.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
