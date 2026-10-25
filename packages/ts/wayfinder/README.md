# @osdlc/wayfinder

Browse and run every task in a repository from one list: package.json
scripts, just, make, cargo, moon, mise and the rest, plus the install, tool and
git-hook commands your package managers and tool managers imply.

```sh
way                  # the terminal UI; Enter runs the selected task
way serve            # the same catalog as a live page
way query dev        # the tasks matching a search, best match first
way run 'just build' # run one task by its id or command line
way list --json      # the data, for anything else
way providers        # every tool it knows, and whether its binary is on PATH
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
is kept in `${XDG_CONFIG_HOME:-~/.config}/way` on Linux and macOS and
`%APPDATA%\way` on Windows, or under `$WAYFINDER_ROOT/config/way` when that
is set. `way clean --dev` removes it,
with the shims `way dev install` wrote. A checkout runs from
source, so it needs [Bun](https://bun.sh) on an absolute PATH entry and a
`pnpm install` in the checkout. A `bun` found only through a relative entry
such as `bin` or `.` is not used.

## Why

A repository of any size runs its work through several tools at once, and each
answers only for itself. `just --list` shows recipes. `moon query tasks` shows
moon tasks. Neither helps when the question is "how do I start that app" and you
do not yet know which tool owns it.

`wayfinder` puts all of them in one searchable list. Each row shows the command
you would type, and in the terminal UI, Enter runs it.

## Groups

Rows come in five groups, in this order, on every surface:

| Group | What fills it | Example rows |
| --- | --- | --- |
| Tasks | task runners: scripts, recipes, targets | `npm run dev`, `just deploy` |
| Dependencies | the detected package managers | `npm ci`, `cargo fetch` |
| Tools | tool managers such as mise and proto | `mise install` |
| Git hooks | lefthook, husky, pre-commit | `lefthook install` |
| Skills | agent skills in `.claude/skills`, `.agents/skills`, `.cursor/skills` | `/review [pr-number]` |

The terminal UI and the page show a break between groups in the tab bar.
`--json` adds a `groups` array: `{id, title, runners}` for each group that has
rows. `runners.order` reorders runners within a group; the groups keep their
order.

Skills are not tasks. An agent runs one when you type `/<name>`, so Run
copies `/<name>` and nothing is spawned; `way run /review` says so and exits
1. `list` and `query` print a `/<name> [hint]` line for each skill after the
tasks, and search matches a skill's name and description as it matches a
task. `--json` puts them in `skills`: `name`, `description`, `argumentHint`,
`path`, `scope`, `origin` (`project`, `user` or `plugin:<id>`), `harnesses`
and `invoke`. They are read from files by `@osdlc/detect-harness`; nothing
runs. The `skills` setting chooses which: `project` (the default) lists the
repository's own, `all` adds yours and your plugins' from the home folder, and
`off` lists none.

## The terminal UI

```text
enter  run the selected task, handing it this terminal
       (a task that takes arguments asks for them first)
^y     copy its command line (on a skill: /<name>)
tab    next tab (all · just · node-scripts │ dependencies │ tools … │ skills)
,      settings: runners, discovery, excluded paths and trust
^s     trust this repository, when runners are withheld for want of it
^r     re-probe (always a real probe, never the store)
^t     only services — tasks that run until you stop them
^e     exact search instead of fuzzy
^d     only tasks a file declares
^o     scope: all, the root only, or at most 2 or 3 levels down
?      every key
esc    quit
```

The footer shows as many of these as fit, and always `? help` and `esc quit`.
`?` lists every key; `way --help --all` prints the same list. Both come from
one table, `KEY_TABLE` in `src/keys.ts`, which the web view's key help reads
too.

`^s` asks first. The status line becomes `trust this repository? y/n`, and
only `y` records a grant. A single key press should not decide whether this
repository's code may run.

A recipe that takes arguments asks for them first. Enter on
`just deploy <env>` turns the key line into a command line, with the command
already on it and the cursor after it. Type `staging` and press Enter to run
`just deploy staging`, or press `esc` to go back. A task whose parameters
could not be read is marked `?` and asks too; an empty line runs it as it
is. A task with no arguments runs as soon as you press Enter.

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
`way query` matches everything, the same as `way list`. Every collection
flag applies (`-C`, `--only`, `--exclude`, `--cached` and the rest). Like
`list`, it re-probes unless you pass `--cached`.

`list`, `query` and the terminal UI replace each control character and bidi
control in repository text with U+FFFD, so a task name cannot send escape
sequences to your terminal or read in a different order from what runs.
`--json` keeps the text exact, writing DEL, C1 and bidi controls as `\u`
escapes, so it is safe to print too.

## The web view

`way serve` opens a page with the same catalog: a collapsible tree by call
chain, sticky group headers, fuzzy and exact search, and copy buttons.

It is a server, not a generated file, on purpose. A file goes out of date as
soon as you add a task. The server re-probes, and the page refreshes when it
gets focus and on a slow poll, so it shows what the repository has now.

Every action on the page is a command of `way` called over HTTP: the list
is `way list`, a trust grant is `way trust`, a saved setting is `way config
set`. The page first asks for the [stored probe](#the-cache), then for a
real one. So the page appears at once, even when the slowest runner takes
seconds. The rows update in place when the probe finishes. Refresh always
runs a real probe.

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
way trust --untrust       remove this repository's whole-repository grant
way trust --untrust-all   remove every grant of this repository
way trust --show          report this root's trust and what decided it
way trust --list          every grant, one per line
way trust --scope <tool>  with a mode above: one tool's grant, such as mise
way trust --json          the same answer as one JSON object
way trust --help          this list
```

Every mode prints the same JSON shape under `--json`:
`{"action": …, "changed": …, "roots": [{"root": …, "trusted": …, "by": …, "rule": …, "scope": …}]}`.
A caller does not have to branch on the flag it passed. `--list` gives one
entry per grant. `by` is `"marker" | "path" | "owner" | null` and names the
layer that decided (see [The policy](#the-policy) below). `rule` is the
matching policy entry, present only when `by` is `"path"` or `"owner"`.
`scope` is present for a one-tool grant. A `--untrust` that finds nothing to
remove still prints its object, and reports the miss with exit 1 and a line
on stderr. So a parser never gets an empty stdout.

A repository you do not trust as a whole can have single tools trusted.
`way trust --scope just` lets just run its tool while moon stays withheld.
A runner needs its own id trusted, and also each tool manager that runs
commands through itself at the root: in a repository with a `mise.toml`,
moon runs as `mise exec -- moon`, so it needs `--scope moon` and
`--scope mise`. A withheld runner's entry in `unknowns` names what it still
needs in `missing`, and once any tool is trusted its label says which, such
as `withheld: mise is not trusted`. Detection itself never runs a tool under a
tool grant. A grant is made from the command line only: the MCP and HTTP
adapters refuse it.

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
    "owners": ["my-org", "gitlab.com/other-org"], // `origin` remote owners; bare means github.com
    "tools": { "mise": { "paths": ["/home/me/scratch/**"] } } // one tool only
  }
}
```

`trust.tools.<tool>` takes the same `paths` and `owners` and trusts that one
tool only.

`@osdlc/trust-repo`'s `policyExecGate` checks, in order: a marker in the
store, then `trust.paths` (a glob over the root, with symlinks resolved), then
`trust.owners` (the host and owner in the `origin` remote's URL, which
wayfinder asks git for). An entry is `host/owner`, or a bare `owner`, which
means `github.com/owner`. Matching ignores case, and the host must match too:
`my-org` does not trust a clone from `gitlab.com/my-org`. `@osdlc/trust-repo`'s README documents the order and the glob
dialect. wayfinder adds only one thing: a leading `~` in a `trust.paths` entry
expands to `$HOME`. An owner match trusts every repository whose remote names
that owner, so list only owners whose repositories you would run.

Owner trust believes the repository's own git config. The `origin` URL comes
from the repository's `.git/config`, which arrives with the directory, so a
folder unpacked from an archive or copied from a shared drive can name any
owner. Owner trust fits clones you made yourself. `trust.paths` is the
stronger form: a repository cannot choose where it sits on your disk.

`way trust --show` reports which layer decided (`by` and `rule`). A plain
`way trust` still writes a marker on a root the policy already trusts, because
the policy can change later and the marker stays. `--untrust` tells you when
the policy still covers the root after the marker is removed.

### Removing what it has stored

`way clean` removes what wayfinder stores outside your repositories. Bare
`way clean` only reports, so it deletes nothing by default.

```text
way clean                      show each store, where it is, and what it holds
way clean --cache              stored probe results
way clean --trust              forget which repositories you have trusted
way clean --user-config --yes  your user configuration file
way clean --dev                way dev link state and the shims way dev install wrote
way clean --legacy             files left under the tool's name before its first release
way clean --everything --yes   every store above
way clean --json               the same answer as one JSON object
```

`--json` prints `{mode, stores}`, where each store is
`{key, flag, what, path, bytes, removed, envVar}`. A bare report lists every
store; `dev` shims and `legacy` files appear only when present. A removal
lists only the stores you named. `bytes` is null when nothing was stored.
That tells "nothing to remove" apart from "could not remove", since both have
`removed: false`. `envVar` names the variable that chose the path, such as
`WAYFINDER_CONFIG`. Notes go to stderr, so stdout stays one JSON document.

`--user-config` and `--everything` need `--yes`. The cache is rebuilt by one slow
probe. Losing trust means answering the trust question again for each
repository. The configuration is the only store you wrote by hand. A config
that `WAYFINDER_CONFIG` names is named again before it is removed, since it
may live in a dotfiles repository. Once a store is gone, empty directories
above it are removed, up to the base such as `~/.config`. `clean` never
touches anything inside a repository: a project's own `wayfinder.config.json`
belongs to that project. The MCP and HTTP adapters get the report only.

The trust store is a directory of marker files at
`$XDG_STATE_HOME/wayfinder/trusted/`, or `~/.local/state/wayfinder/trusted/`
when that variable is unset. It is state, not config. The program maintains
trust, and a person does not edit it by hand. A consent record copied to a
new machine in a dotfiles repository is no longer consent.

**A repository cannot trust itself.** `allowExec: true` in
`wayfinder.config.json` is ignored with a warning, because that file lives
inside the repository being scanned. The project file may still lower
`allowExec` to `false`. A `trust` block in the project file is ignored with a
warning too. Unlike `allowExec`, trust has no lower setting a repository could
choose.

`--exec` allows execution for one run and records nothing, which suits a
script or a CI job. `--no-exec` turns execution off, however trusted the
repository is. Both flags apply on every surface, including the web view,
whose every command runs with the flags `way serve` started with. The page
offers a trust grant only when one would change what is read, and asks
before it sends it.

When runners are withheld, every surface says so and offers a way to grant
trust. `list` and `query` print one line on stderr. The terminal UI shows
`2 runners withheld: this repository is not trusted (^s to trust)` beside the
counts, and a `–` in place of the count on each withheld tab. The web view
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

The terminal UI and `serve` always start from the store. They read it, show
the rows, then probe in the background and update in place. `list` and
`query` re-probe on every run, because a script or an agent reading them needs
what the repository has right now. Those runs also write the store, so the next
UI start is instant. `--cached` makes `list` and `query` read the store for
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
`list` stays pipeable and `--json` stays parseable:

```text
way: --cached: just (stale: its files changed, 35s old; refresh usually about 149ms); not cached, probed now: github-actions
```

`--cached` with an empty store is not an error. It probes, stores the result,
and says so. Every `--json` document has a `cache` array, with one entry per
selected runner. After a fresh probe each entry's `probeMs` is the time that
runner took. Over HTTP the page always receives this array.

The cache is at `$XDG_CACHE_HOME/wayfinder/`, or `~/.cache/wayfinder/`. It is
cache, not the `~/.local/state/wayfinder/` directory that
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
`excludePaths`, `trust.paths`, `trust.owners`, `trust.tools`, `tools`, `open`,
`theme` and `skills`. `open` (`tui` or `web`) is what a bare `way` opens.
`theme` (`system`, `light` or `dark`) is the web view's colour scheme.
`skills` (`project`, `all` or `off`) chooses the agent skills listed (see
[Groups](#groups)). `trust`, `open`, `theme` and `skills` count only in the
user file: a project file's value is dropped with a warning. An unknown key is a warning that names the closest known key.

The package ships the file's JSON Schema at `schema/config.json`, built from
the same Zod schema that validates the file. `way config set` writes
`$schema` into a file that has none, keeps the keys in the schema's order,
and replaces the file in one atomic write.

`WAYFINDER_CONFIG` names a different user file and changes nothing else. A
relative `WAYFINDER_CONFIG` is ignored with a warning: from the repository
root it would name a file in the repository. Use an absolute path or `~/`.
Every command reads it the same way.

The config, state and cache directories follow XDG on every platform.
`WAYFINDER_ROOT=/dir` moves all three under one directory, and
`WAYFINDER_CONFIG_DIR`, `WAYFINDER_STATE_DIR` and `WAYFINDER_CACHE_DIR` move
one each. A relative value there is an error. A relative `HOME` counts as
unset, and the account's home is used. A relative `XDG_*` value is ignored,
as the XDG spec says, and a `~` in one is not expanded. See
[Paths](docs/guide/configuration.md#paths).

```text
way config list [--json]                          every setting, and the layer it came from
way config get <key>                              one setting's effective value, as JSON
way config set <key> <value> [--user|--project]   write a setting (default --project)
way config unset <key> [--user|--project]         remove a setting (default --project)
way config path                                   where each layer's file lives
way config explain <key>                          how a setting got its value, layer by layer
way config --help                                 this list
```

`set --project` refuses what a project file may not hold: `allowExec: true`,
`trust`, `open`, `theme` and `skills`. The web view refuses the same writes. The MCP and
HTTP adapters cannot change `trust`, `allowExec` or `tools` at all.

`-C` applies here too, so `way config path -C /elsewhere` reports that
directory's files rather than this one's. Exit code 2 means the command as
typed cannot run, such as an unknown key or a value of the wrong type. Exit
code 1 means the command was valid but failed against the state it found.

`runners.order` sets the runner order everywhere: `list`, `query`, the
terminal UI's tab order, and the web view. Dragging a tab in the web view saves
the order to your user config. A project's order wins over the user's.

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

## Commands

```text
way [dir]                the terminal UI (the default command)
way list [dir]           print one command line per task; --json for the catalog
way query <terms>        the tasks matching a search, best match first
way run <id> [-- args]   run one task, with its exit code; --dry-run for the plan
way serve                the same catalog as a live page
way providers            the registered tools, built-in and your own
way config | trust | clean | guide
way help [command]       help for a command; --all for every flag
way schema <command>     the JSON Schema of a command's --json document
way --version
```

`run` takes a task's `id` or its command line, when only one task has it, such
as `way run 'npm run build'`. Arguments after `--` are bound the way the tool
expects, as the terminal UI and the page bind them. A task that ends on a
signal exits 128 plus the signal number. `--dry-run --json` prints the
`argv`, `cwd` and `env` it would run. A plain `run --json` is refused,
because the task owns stdout.

Global flags go before or after the command word: `way -C ../app list` and
`way list -C ../app` are the same. A start directory that does not exist is an
error, so a mistyped command (`way lsit`) is reported with the closest one.
Messages on stderr start with `way:`.

### Filters

`list` and `query` take the same filters, in text and in JSON:

```text
--services           only tasks that run until you stop them
--declared           only tasks a file declares, not ones from a convention
--depth N            only tasks whose source is at most N directories deep
--cached             answer from the last stored probe
```

### Documents

Every `--json` answer is one object with `schemaVersion` and `kind`:
`catalog` (`list`), `query`, `run`, `providers`, and the framework's `help`,
`version` and `error`. `way schema list` prints a document's JSON Schema. The
same schemas are exported from `@osdlc/wayfinder/schema`:

```ts
import { catalogDocumentSchema, documentZod } from '@osdlc/wayfinder/schema'

const doc = documentZod('catalog').parse(JSON.parse(output))
```

| Export | Is |
|---|---|
| `catalogSchema`, `taskSchema`, `runnerReportSchema`, `CATALOG_SCHEMA_VERSION` | system-model's catalog schemas |
| `catalogDocumentSchema`, `queryDocumentSchema`, `runDocumentSchema`, `providersDocumentSchema` | the JSON Schema of each document |
| `DOCUMENT_SCHEMAS`, `DOCUMENT_VERSIONS` | the same, by `kind` |
| `documentZod(kind)` | a Zod schema that parses a document |

The `catalog` and `query` documents carry `cache`, `filter` and `unknowns`.
`unknowns` lists what could not be read, each with the `label` the stderr note
prints: a runner withheld for trust, tasks whose parameters are unknown and
why, a stale stored answer, a tool missing from `PATH`.

### Old flags

These still work in this release and will be removed in a later one:

```text
way --serve          way serve
way --list           way list
way --json           way list --json
way query --list     way query
```

Two of them at once are refused.

## Options

```text
--exact              with query: terms match as substrings, not subsequences
--port N             with serve: a fixed port
--no-open            with serve: print the URL rather than opening a browser
--json               with a data command: print its document

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
```

`config`, `trust`, `clean` and `guide` read their own flags. Of the global
flags they take only `-C`, and only where the answer depends on the
repository:

| Subcommand | `-C, --dir` | Why |
|---|---|---|
| `config` | yes | reports the configuration THAT directory resolves |
| `trust` | yes | the grant keys on that directory's project root |
| `providers` | yes | a trusted project file can add tools when execution is allowed |
| `clean` | accepted, unused | resolves every path from the environment and the home directory |
| `guide` | accepted, unused | its argument is a topic name |
| `dev` | no | its state is devlink's, keyed on the tool name; not listed in the help |

`way help` lists the commands and the global flags. `way help <command>` and
`way <command> --help` show one command, and `--all` adds every note. `way
--help --all` is the full flag list shown above. `way guide` is the long
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
way --config ./acme-tools.ts list                   # this run only
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
whether that binary is on PATH, its language (`any language` for make, just
and the like), whether it is built in or custom, and its homepage. `--json`
gives the same rows as data, with a one-line `description`. Only absolute PATH entries count, as in
detection: a tool found only through a relative entry (`bin`, `.`,
`node_modules/.bin`) reads as not installed. Put an absolute entry for it on
PATH.

## Library

The package's root entry builds the same catalog from code, without spawning
`way`. It runs on Node.

```ts
import { buildCatalog, filterTasks, terminalSafe } from '@osdlc/wayfinder'

const doc = await buildCatalog({ dir: '.', flags: { allowExec: false } })
for (const hit of filterTasks(doc.reports, { query: 'dev' })) {
  console.log(terminalSafe(hit.task.display))
}
```

`buildCatalog` takes what the CLI takes as flags (`flags`, `cached`,
`filter`) and returns the `catalog` document `way list --json` prints. It
reads the same config files, applies the same trust gate and writes the same
probe store. Nothing in the repository runs unless it is trusted and
execution is allowed. It throws `SessionError` with a `code` for a directory
that does not exist, a config file that cannot be used, or a tool module that
cannot be loaded.

| Export | Is |
|---|---|
| `buildCatalog`, `BuildCatalogOptions`, `CatalogDocument` | the catalog for a directory |
| `filterTasks`, `keepsTask`, `sourceDepth`, `hasQuery`, `TaskFilter`, `TaskHit` | the search and filters every surface uses |
| `filterSkills`, `skillLine`, `SkillRow`, `SkillHit`, `SkillsSetting` | the Skills group |
| `GROUPS`, `SKILLS_GROUP`, `groupOf`, `catalogGroups`, `documentGroups` | the groups and their order |
| `unknownsOf`, `unknownLine`, `Unknown` | what could not be read, with its label |
| `runnerLabel`, `withheldLabel`, `languageLabel`, `toolSummary` | the words a person reads |
| `terminalSafe`, `jsonText` | repository text made safe for a terminal |
| `SessionError` | why a catalog could not be built |
| `Catalog`, `RunnerReport`, `Task`, `Param` | system-model's types |

Repository text (task names, skill descriptions, paths) can hold terminal
control characters. Pass it through `terminalSafe` before printing it.
Other paths into the package are closed; `@osdlc/wayfinder/schema` is the
other entry. Before 1.0 a minor release may change these names, and the
changelog says how.

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
