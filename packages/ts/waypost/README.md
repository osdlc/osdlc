# @osdlc/waypost

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
npm install --global @osdlc/waypost
```

This puts `way` on your PATH. `pnpm add --global` and `bun add --global` work
too. ESM only.

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of its dependency
`@osdlc/typed-git`. Bun can also run it.

## Running from a checkout

An installed `way` follows the source you are working on, over
[`@osdlc/cli-tool/devlink`](https://www.npmjs.com/package/@osdlc/cli-tool). Standing
inside a waypost checkout runs that checkout; `way dev link` makes one the
checkout every `way` on the machine runs; every link is remembered.

```sh
way dev install          # once: put shims for this checkout on PATH as way and waypost
way dev link             # this checkout answers everywhere, until told otherwise
way dev history          # every checkout ever linked, most recent first, with branch and HEAD
way dev use #2           # back to an earlier one …
way dev use canonical    # … or to the install itself
way dev status           # which checkout runs now, and why
```

First hit wins: `WAY_HOME`, a checkout above the cwd (`WAY_CWD_DEV=0` turns
that off), the linked checkout, then the install. The shim says which entry
it chose on stderr; `WAY_QUIET=1` silences it. State lives in
`<config>/way/`: `~/Library/Application Support/way` on macOS,
`${XDG_CONFIG_HOME:-~/.config}/way` elsewhere. A checkout runs from source, so
it needs [Bun](https://bun.sh) on PATH and a `pnpm install` in the checkout.

## Why

A repository of any size runs its work through several tools at once, and each
answers only for itself. `just --list` shows recipes. `moon query tasks` shows
moon tasks. Neither helps when the question is "how do I start that app" and you
do not yet know which tool owns it.

`waypost` puts all of them in one searchable list, keyed by the call chain you would
actually type, and — unlike anything a browser can do — lets you press Enter.

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

`^s` asks before it grants: the status line becomes `trust this repository?
y/n`, and only `y` records anything. One keystroke is not a decision when the
thing being decided is whether this repository's code may run.

A recipe that takes arguments collects them first. Enter on `just deploy <env>`
turns the key line into a command line with the command already on it and the
cursor after it — type `staging`, Enter runs
`just deploy staging`, `esc` goes back. A task that takes nothing is unchanged:
Enter still runs it, with nothing to dismiss.

Fuzzy by default. Terms are ANDed, so `photo dev` narrows to a photo app's dev
server. A leading `'` forces one term to match exactly.

The four keystrokes worth knowing: **`^t`, then the app's name, then Enter.**

What Enter will run is always on screen above the key line, so it is never a
surprise. Tasks are spawned from an argument vector, never through a shell, so a
recipe with `<placeholders>` cannot be mangled into something else on the way.

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
that matched nothing exits **1**, so `way query dev && …` is usable from a
script; a bare `way query` searched for nothing, matches everything, and is
`way --list`. Every collection flag applies — `-C`, `--only`, `--exclude`,
`--cached` and the rest — and, like `--list` and `--json`, it re-probes unless
you ask for the store.

## The web view

`way --serve` opens a page with the same catalog: a collapsible tree by call
chain, sticky group headers, fuzzy and exact search, and copy buttons.

It is a server rather than a generated file on purpose. A file would be a
snapshot — add a task and the page is quietly wrong. Here the server re-probes
and the page refreshes on focus and on a slow poll, so what you are looking at
is what the repository currently has.

The very first request is answered from the [stored probe](#the-cache) with a
real probe already running behind it, so the page appears at once on a
repository whose slowest runner takes seconds; the rows update in place when
the probe lands. Refresh is always a real probe.

## Execution, and trust

Some runners can only be read by running them. `moon query tasks` evaluates the
repository's own toolchain configuration, and `mise tasks` can fire its
`[hooks]`. Pointing a task browser at a repository you did not write is
therefore code execution: you may choose to run nothing, and merely looking
already ran that repository's code.

`waypost` is willing in principle: its `allowExec` default is `true`, because you
reach for a task browser standing in your own repository and one that cannot see
the build graph is not much of a browser. But willingness is not the gate. Trust
is, asked once and remembered per repository:

```text
way trust                 trust the repository at the resolved root
way trust --untrust       remove this repository's trust
way trust --show          report this root's trust status
way trust --list          every trusted path, one per line
way trust --json          the same answer as one JSON object
way trust --help          this list
```

Every one of these answers in the machine form too. `--json` gives one object
per invocation — `{"root": …, "trusted": …, "changed": …, "by": …, "rule": …}`
for the three root-scoped modes, so a caller never has to branch on the flag
it just passed, and `{"trusted": [paths]}` for `--list`. `by` is
`"marker" | "path" | "owner" | null` — which layer decided, see "The policy"
below — and `rule` is the matching `trust.paths`/`trust.owners` entry, present
only when `by` is `"path"` or `"owner"`. A `--untrust` that found nothing still
prints its document and reports the miss through exit 1 and stderr, so a parser
is never handed an empty stdout to interpret.

`-C` applies here too. Trust, with execution allowed, also lets the project
file load tool modules; see
[Adding your own tools](#adding-your-own-tools).

### The policy

A root can also be trusted with no marker at all, through a `trust` block in
the USER layer of the config file (never the project layer — a repository
cannot grant itself trust, same as `allowExec: true`):

```jsonc
// ~/.config/waypost/config.json
{
  "trust": {
    "paths": ["/home/me/work/**"], // @osdlc/trust-repo's glob dialect
    "owners": ["my-org"] // case-insensitive `origin` remote owners
  }
}
```

`@osdlc/trust-repo`'s `policyExecGate` decides trust in order — a marker in
the store, then `trust.paths` (a glob over the resolved, symlink-free root),
then `trust.owners` (the owner in the `origin` remote's URL, read from
`.git/config` without running git). The precedence and the glob dialect are
documented in `@osdlc/trust-repo`'s README. waypost adds no vocabulary of its
own beyond expanding a leading `~` in a `trust.paths` entry against `$HOME`.
An owner match trusts every repository whose remote names that owner, so list
only owners whose repositories you would run. `way trust --show` reports which layer decided (`by`/`rule`);
the plain grant still writes a marker on a policy-trusted root — a standing
policy can change out from under a repository, and the marker is the more
durable of the two — and `--untrust` says when the policy still covers the
root after the marker is gone.

### Removing what it has stored

Three things live outside your repositories, and `clean` is how they go away.
Bare `clean` reports them and removes nothing — a command whose subject is
deleting should not delete by default.

```text
way clean                  show each store, where it is, and what it holds
way clean --cache          stored probe results
way clean --trust          forget which repositories you have trusted
way clean --config --yes   your user configuration file
way clean --all --yes      all three
way clean --json           the same answer as one JSON object
```

`--json` answers the same thing as one object: a `stores` array of
`{key, flag, what, path, bytes, removed}`, all three on a bare report and only
the ones you named on a removal. `bytes` is null when nothing was stored, which
is what separates "there was nothing to remove" from "it would not delete" —
both are `removed: false`. The closing note about trust being asked for again
goes to stderr under `--json`, so stdout stays one parseable document.

`--config` and `--all` want `--yes` because the three are not equally
replaceable: the cache is derived and costs one slow probe, trust costs
re-answering a question per repository, and the configuration is the only thing
here you wrote by hand. Nothing inside a repository is ever touched — a
project's own `waypost.config.json` belongs to that project.

The store is a directory of marker files at `$XDG_STATE_HOME/waypost/trusted/`, or
`~/.local/state/waypost/trusted/` when that variable is unset. XDG **state**, not
config: trust is state a program maintains, not configuration a person
hand-edits, and a consent record that travels in a dotfiles repo onto a new
machine has stopped being consent.

**A repository cannot trust itself.** `allowExec: true` in `waypost.config.json` is
ignored with a warning, because that file lives inside the repository being
scanned. The project layer may still lower `allowExec` to `false`. A
project-layer `trust` block is rejected outright, the same way — trust has no
"lower" state to honour from inside the repository.

`--exec` is the escape hatch and records nothing — consent for one run, which is
what a script or a CI job wants. `--no-exec` turns execution off however trusted
the repository is. Both hold on every surface, the web view included: its
`POST /api/trust` refuses with `409` whenever a grant would not apply, so
`--no-exec` cannot be lifted from the page and `--exec` cannot be persisted by
it. The page hides its button in those states, and the server refuses the
request anyway — the session token says who is asking, never that asking made
sense.

When runners are withheld, every surface says so and offers the grant where it
says it: `--list` and `--json` print one line on stderr, the terminal UI notes
`N hidden — repo not trusted (^s to trust)` beside the counts, and the web view
puts a **Trust this repository** button in each held-back runner's info panel
and in the runner picker.

### What decides

`configured` is `allowExec` after the layers and waypost's own `true` default.

| configured `allowExec` | trusted | flag | effective | why |
| --- | --- | --- | --- | --- |
| any | any | `--no-exec` | `false` | the flag is the last word, and the store is not even read |
| any | any | `--exec` | `true` | consent for this run, typed by a person; nothing is recorded |
| `false` | any | none | `false` | a file said no; trusting the repository would change nothing |
| `true` | no | none | `false` | willing in principle, but this repository has not been trusted |
| `true` | yes | none | `true` | the only combination that runs a subprocess |

A decision is keyed on the absolute, symlink-resolved repository PATH, not on a
hash of its contents — the same tradeoff mise makes. A repository you trusted
that later pulls hostile changes stays trusted, and `way trust --untrust` is the
only remedy. Content-hashing every runner config instead would re-prompt on
ordinary edits, training people to approve without reading.

## The cache

Some runners are slow to ask — moon starts its toolchain, sbt starts a JVM — and
a browser that waits for them looks broken. `waypost` keeps the last answer per
(root, runner) so the UI has something to paint at once.

**The two surfaces you look at always start from the store.** The terminal UI
and `--serve` read it, paint, then probe behind you and update in place. **The
two you pipe do not.** `--json` and `--list` re-probe every run, because a script
or an agent reading them must get what the repository has right now; those runs
also write the store, so the next UI start is instant. `--cached` inverts it for
one run.

Three states, and each surface shows them the same way:

- **Fresh** — the stored answer still holds, and nothing is said.
- **Stale** — the answer was used and is out of date. The terminal UI marks the
  runner's tab with a leading `~` and notes `cached rows — re-probing just
  (~149ms)` beside the counts, or `cached rows: just 35s old — ^r to re-probe`
  once the refresh is over and the rows are still the stored ones; the page
  shows `cached: just 35s old - re-probing`.
- **Stale and slow to probe here** — the case the cache exists for, called out
  louder in red rather than in the same voice as a 200ms refresh:
  `cached rows — moon (~2.4s) is slow to probe here, so this takes a moment`.

Slowness is measured in THIS repository, from a rolling window of the last five
probe durations reported as their median. A runner that is quick here is never
called slow because it is slow somewhere else, and where a repository has no
measurement yet the surface says so rather than inventing a number.

`^r` in the terminal UI and Refresh on the page are always real probes — the one
action that guarantees accuracy never answers from the store.

If a row you run turns out not to exist — a task renamed since the stored probe —
both surfaces say where the row came from instead of leaving you with a bare
spawn failure.

For the pipeable surfaces, `--cached` names the stale runners on stderr, so
`--list` stays pipeable and `--json` stays parseable:

```text
waypost: --cached: stale: just (35s old, refresh usually about 149ms)
waypost: --cached: not cached, probed now: github-actions
```

`--cached` against an empty store is not an error: it probes, stores the result,
and says so. `--json --cached` gains a `cache` array beside the catalog, one
entry per selected runner; over HTTP the page always receives it.

The store is at `$XDG_CACHE_HOME/waypost/`, or `~/.cache/waypost/`. XDG **cache**,
deliberately not the `~/.local/state/waypost/` [trust](#execution-and-trust) uses:
losing this costs one slow probe, while losing the trust store would silently
un-trust repositories. The cache is no part of the execution gate — a cached
answer is never a trust grant, clearing the cache never changes what is trusted,
and a runner withheld for want of trust is never stored at all. Invalidation is a
content hash over the files a probe depended on, never an mtime; the
[`@osdlc/system-model` README](https://www.npmjs.com/package/@osdlc/system-model)
sets out its limits.

## Configuration

The options you would otherwise retype on every invocation live in a file:
which runners to skip, what order to show them in, whether execution is
allowed, how files are discovered. Layers, lowest precedence first — built-in
defaults, `$XDG_CONFIG_HOME/waypost/config.json` (or `~/.config/waypost/config.json`),
`waypost.config.json` at the project root, then the flags on this command line.

The keys are `runners.disabled`, `runners.order`, `allowExec`, `discovery`,
`excludePaths`, `trust.paths`, `trust.owners` and `tools`. `WAYPOST_CONFIG`
names a different user file and changes nothing else.

```text
way config list [--json]                          every setting, and the layer it came from
way config get <key>                              one setting's effective value, as JSON
way config set <key> <value> [--user|--project]   write a setting (default --project)
way config unset <key> [--user|--project]         remove a setting (default --project)
way config path                                   where each layer's file lives
way config --help                                 this list
```

`-C` applies here too, so `way config path -C /elsewhere` reports that
directory's files rather than this one's. An exit code of 2 means the command
as typed cannot run — an unknown key, a wrong-typed value — and 1 means it was
well formed but failed against the state it found.

`runners.order` sets the report order everywhere — `--json`, `--list`, the
terminal UI's tab cycle, and the web view, where your own drag-reordering
(persisted in the browser) still layers on top of it.

### `allowExec` here

waypost's execution default is `true`, below any file. Highest precedence first:

1. `--exec` or `--no-exec` on this command line
2. `allowExec` in the user file, then `allowExec: false` in `waypost.config.json`
3. waypost's own default, `true`

A file has to say `false` for execution to be off. `way config list` and
`way config get allowExec` report that default, labelled `(default)`.

This settles willingness, not execution: [trust](#execution-and-trust) is the
gate above it, so a `true` here still collects nothing until the repository is
trusted.

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
dev                  link a checkout of this tool over the installed copy
```

A subcommand is claimed before the flag parse, so the flags above are the
top-level command's, not theirs. `-C` is the exception: the subcommands whose
answer depends on which repository you are asking about take it.

| Subcommand | `-C, --dir` | Why |
|---|---|---|
| `config` | yes | reports the configuration THAT directory resolves |
| `trust` | yes | the grant keys on that directory's project root |
| `providers` | yes | a trusted project file can add tools when execution is allowed |
| `clean` | no | resolves every path from the environment and the home directory |
| `guide` | no | its argument is a topic name |
| `dev` | no | its state is devlink's, keyed on the tool name |

`way --help` is the short form: the ways in, the two flags most invocations
pass, and the names of everything below it. `way --help --all` is the complete
flag list — the block above — and each subcommand answers for itself with its
own `--help`. `way guide` is the long form, by topic. A tool that answers a
mistyped flag with its whole surface makes the reader hunt for the error, so a
usage error prints the short form too.

`way guide` prints usage-and-extension instructions for people and for agents;
`guide extend` is how to add a tool and `guide trust` the exec gate.

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
`--no-exec`); otherwise waypost prints a warning and loads nothing from it.
`way guide extend` prints a complete example. A tool's runner may define
`invoke(task, args)` to say where typed arguments go, such as after `--` for
`npm run`; the default appends them.

`way providers` lists every registered tool: its roles, its runner kind
(`parse` reads files, `exec` must run the tool and needs trust), its binary,
whether that binary is on PATH, and whether it is built in or custom.
`--json` gives the same rows as data.

## How it compares

- **Each tool's own list** (`just --list`, `npm run`, `moon query tasks`)
  answers for one tool. waypost asks all of them and shows one list.
- **[fzf-make](https://github.com/kyu08/fzf-make)** is a fuzzy picker for
  make, npm, pnpm, yarn, just and task targets, shipped as a Rust binary.
- **[runpalette](https://github.com/Adam014/runpalette)** is a Node CLI with
  one list of package.json, justfile, Taskfile, Makefile, Cargo and Gradle
  commands.
- waypost covers more runners (moon, mise, docker-compose, GitHub Actions and
  others), adds the install and hook commands, has a web view and JSON output,
  caches slow runners, and withholds runners that execute code until the
  repository is trusted.

## Platforms

Tested on Linux and macOS. Windows is untested: running tasks and opening the
browser assume a POSIX environment.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
