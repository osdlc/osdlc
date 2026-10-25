# @osdlc/cli-tool

What a standalone CLI needs before it does anything of its own.

It implements the osdlc [CLI interface standard](../../../standards/cli-interface.md):
help with progressive disclosure, `--json` on every command as a versioned
document, a `schema` command, `--version`, fixed exit codes, and stream
discipline.

A command-line tool written in TypeScript tends to repeat the same groundwork:
a way to write output that a test can capture, one rule for exit codes, flags
and help text that agree with each other, and a launcher that can run the tool from
a development checkout. This package holds that groundwork so each tool does not
write it again. It is a library of parts. A tool's own `main` stays its own.

It is for CLIs that other people run on their machines and that you want to test
without spawning a process.

When not to use it:

- You want plugins: commands loaded from other packages at run time. The
  command tree here is the tool's own.
- You need Windows support today. See Platforms.
- You are writing a one-off script. `node:util` `parseArgs` is enough.
- You do not want `commander` in your dependency tree. `defineCli` builds on it.

## Install

```sh
npm install @osdlc/cli-tool
```

`pnpm add @osdlc/cli-tool` and `yarn add @osdlc/cli-tool` work too.

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { defineCli, runMain, EXIT, type CliContext } from '@osdlc/cli-tool'

const cli = defineCli({
  name: 'sweep',
  summary: 'Say what has been merged and can go away.',
  flags: {
    all: { kind: 'boolean', help: 'every repository in the config file' },
    gh: { kind: 'boolean', negatable: true, help: 'use GitHub evidence' },
    output: { kind: 'enum', choices: ['text', 'json'], default: 'text', help: 'report format' },
  },
  positionals: [{ name: 'path', variadic: true, help: 'a checkout, or a directory of them' }],
})

export function main(argv: readonly string[], ctx: CliContext): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`sweep: ${parsed.message}\n\n${cli.help()}`)
    return EXIT.error
  }
  const { all, gh, output } = parsed.values // boolean, boolean, 'text' | 'json'
  ctx.io.stdout(sweep(parsed.positionals, { all, gh, output }))
  return EXIT.ok
}
```

The bin shim is the only thing that touches the process:

```js
#!/usr/bin/env node
import { runMain } from '@osdlc/cli-tool'
import { main } from '../dist/cli.js'

await runMain(main, { name: 'sweep' })
```

## Entries

| Import | What it holds |
|---|---|
| `@osdlc/cli-tool` | The basics described below: output interface, context, exit codes, flag declaration, help wrapping, bin shim |
| `@osdlc/cli-tool/command` | A CLI as a tree of declared commands, with `help`, `schema`, `--json` and `--version` generated from it |
| `@osdlc/cli-tool/config-command` | `config list/get/set/unset/path` over a tool's own config store |
| `@osdlc/cli-tool/trust-command` | `trust`, `--untrust`, `--show`, `--list` over a tool's trust store |
| `@osdlc/cli-tool/guide` | `guide [topic]` from a list of topics |
| `@osdlc/cli-tool/testing` | Running an app in process and the checks every tool's tests share |
| [`@osdlc/cli-tool/devlink`](./devlink/README.md) | Running a system-installed tool from a development checkout, with link history |

The command entries load `zod`, a peer dependency. The root entry does not.

The tool's project and machine config files are a separate package,
`@osdlc/config-layers`. The root re-exports its directory and did-you-mean
helpers (`systemDirs`, `TieredDirs`,
`envVars`, `closestMatches`, `didYouMean`) and their types, taken from the
light `@osdlc/config-layers/dirs` and `/did-you-mean` subpaths so importing the
root does not load yaml or zod.

To import only what a tool uses, the root's modules are also subpaths:
`@osdlc/cli-tool/define-cli`, `/io`, `/prompt`, `/exit` and `/wrap`.

A bin shim asks devlink which checkout should run and then calls `main`.
`main` reads its config and writes through `CliIo`.

## The basics

### Output goes through `CliIo`

```ts
export interface CliIo {
  stdout(text: string): void
  stderr(text: string): void
}
```

`processIo` writes to the real streams and is the only thing that names one.
`captureIo()` collects the text instead, so a test checks output without
monkeypatching a global. A patch that leaks on a missed `finally` breaks every
other test in the process.

Exit codes are not part of `CliIo`. They are return values. There is no
`stdin` member. Other values a command needs beyond output are passed in
`CliContext`:

```ts
export interface CliContext {
  io: CliIo
  cwd: string
  env: Record<string, string | undefined>
}
```

`cwd` and `env` are passed as values rather than read from the process. That
lets a test run a whole command against a temporary directory.
`processContext()` is the real context. `captureContext()` is the one for
tests.

### Exit codes

| Code | Meaning |
|---|---|
| `EXIT.ok` (0) | The command did what it was asked |
| `EXIT.error` (1) | A well-formed command that failed against the state it found |
| `EXIT.usage` (2) | The command cannot run as typed |
| `EXIT_FAILURE` (22-25) | A classified failure, the same in every tool. See below |
| 10-63 | This tool's own outcomes. `isDomainExit` checks the range. Avoid 22-25 |
| 64+ | Not available. `sysexits.h` uses 64-78 and the shell uses 126+ |

A script can act on the difference. 2 means fix the command line, and 1 means
look at the state. A malformed command (an unknown flag or subcommand, a wrong
argument count, a value of the wrong type) is decided from the argument list
and the tool's own schema with nothing read, so running it again can only fail
the same way. It is the same 2 in every tool. 2 is the usual choice: argparse
and most GNU tools already use it.

The 10-63 range is for outcomes of the work ("nothing to sweep" versus
"something failed to delete"), declared by the tool and documented at its own
`main`. It is not another spelling of the three universal codes above.

### Failures

A library below the CLI reports a missing tool, a signed-out `gh` or a network
failure as a `Failure` from [`@osdlc/result`](../result#readme): a `kind`, a
`message` and a `hint`. This package turns one into a line on stderr and an exit
code, the same in every tool built on it. Four categories get a code each, the
ones a script acts on differently:

| Code | `EXIT_FAILURE` | Kinds | A script should |
|---|---|---|---|
| 22 | `missingTool` | `not-installed`, `not-executable` | install the program |
| 23 | `service` | `not-authenticated`, `missing-token`, `not-found`, `tls`, `http`, `unreadable`, `unsupported` | fix the credentials or the name |
| 24 | `repository` | `not-a-repo`, `no-remote`, `bad-remote`, `bad-cwd` | run it somewhere else, or name a repository |
| 25 | `unreachable` | `network`, `remote-unreachable`, `timeout`, `rate-limited` | try again later |

Any other kind (`exit`, `spawn`, `signal`, ...) is an ordinary failed run and
exits 1. `FAILURE_EXIT` is the table by kind and `exitCodeFor(failure)` reads it.

`runMain` does this for a thrown failure (a `FailureError`, which includes
`CommandFailed`). It prints `<name>: <message> <hint>` and sets the category's
exit code. The code follows the `kind` the thrown failure carries, so it is only
as specific as the layer that threw it. `@osdlc/typed-git`, `@osdlc/typed-gh`
and `@osdlc/code-host` throw the classified failure (a signed-out `gh` or
`git push` is 23). A bare `CommandFailed` from elsewhere carries only
command-seam's kinds (`not-installed`, `timeout`, ... and a generic `exit`,
which is 1). Classify before throwing if you want more. A `main` that holds a
`Result` returns instead of throwing:

```ts
const listed = host.listPrs({})
if (!listed.ok) return failWith(ctx, listed.error, { name: 'sweep' })
```

`failWith` prints the same line and returns the code. The line carries only
the message and the hint. The raw `detail` (a tool's stderr) is left to a
caller that asks for it, since this package has no verbose switch. Any other
thrown error prints its message and exits 1.

### Flags are declared, not parsed

`defineCli` builds a [commander](https://github.com/tj/commander.js) command
underneath, so `--flag=value`, short flags, `--no-x` negation and
required-value checking are not reimplemented here. It adds three rules:
nothing writes to a process stream, nothing calls `process.exit`, and a usage
error comes back as a value.

| Kind | Parses to | Notes |
|---|---|---|
| `boolean` | `boolean` | `negatable: true` starts it at `true` and spells it `--no-<name>` |
| `string` | `string`, or `string \| undefined` with no default | `required: true` refuses the run when absent |
| `enum` | one of `choices` | commander rejects anything else |
| `list` | `string[]` | comma-separated and repeatable |
| `count` | `number` | `-vv` is 2 |
| `tristate` | `boolean \| undefined` | `--x`, `--no-x`, or neither |

Keys are camelCase and the flag is the kebab of the key: `binDir` is
`--bin-dir`. `parse` returns one of three states: `ok` with typed values and
positionals, `help` when `--help` was asked for and already written, or
`error` with commander's own wording and no prefix, so the caller decides how
to present it.

A flag with no default parses to `undefined` when the command line does not
mention it, and this matters. A `tristate` or a `list` with no default lets a
value from a configuration file apply when the flag is absent. A flag that is
always present would overwrite the configured value on every run.

The declaration is also the help text. A hand-written usage string next to a
hand-written `switch` are two things to keep in step, and they drift apart.

### Two help tiers

A tool with more surface than a first-time reader needs prints a short help by
default and a complete one on request. Both render from the one declaration,
so a flag cannot be in the parser and missing from the complete help.

| Piece | Effect |
|---|---|
| `hidden: true` on a flag | Left out of the short help. Still parsed, and still shown by `help({ all: true })` |
| `shortEpilogue` | Used instead of `epilogue` in the short tier |
| `autoHelp: false` | Commander stops owning `-h, --help`, so the tool can render the tier itself |

`autoHelp: false` is what makes the second tier possible. Commander acts as
soon as it reads `--help`, so it can never see `--help --all` together. A
two-tier tool turns it off, declares `help` and its modifier as ordinary
flags, and picks the tier after parsing:

```ts
const cli = defineCli({ name: 'tooly', autoHelp: false, flags: {
  help: { kind: 'boolean', short: 'h', help: 'the short form' },
  all: { kind: 'boolean', help: 'with --help: every flag and every note' },
  // …
}})
const USAGE = cli.help()
const SHORT_USAGE = cli.help({ all: false })
```

For a tool called `tooly`, `tooly --help` can show the ways in and the common
flags, and `tooly --help --all` every flag and every note. A usage error prints
the short tier, because answering a mistyped flag with the whole surface makes
the reader hunt for the error. A one-tier tool declares neither and lets
commander own `--help`.

### Help is wrapped when it is rendered

`defineCli` reflows its epilogues to `width` (default 80) each time it renders
help. `wrapText(text, width)` does the same for any text. A line that starts at
column 0 is prose and is filled again. An indented line, a table row, a usage
line or a fenced block is kept as written. So prose with names interpolated
into it never comes out ragged. `helpWidth(columns)` picks the width for a
terminal: its width kept between 40 and 100, or 80 when stdout is not a
terminal. `columns(rows, width)` lays out a two-column list.

### Terminals and color

`CliContext.terminal` says which streams are terminals and how wide stdout is.
`processContext()` fills it in. A context without it reads as "no terminal".
`colorEnabled(ctx, { json })` is the color rule: `NO_COLOR` (non-empty) turns
color off and wins, `FORCE_COLOR` (not `0` or `false`) turns it on, `TERM=dumb`
turns it off, and otherwise color follows whether stdout is a terminal. A JSON
answer is never colored.

### `runMain`

Assigns `process.exitCode` rather than calling `process.exit`, because
exiting at once truncates buffered stdout, and the bug only shows under a
pipe. A thrown error becomes one line on stderr and exit 1. A thrown failure
becomes its line and its category's exit code (see Failures). It prints no
stack trace, because a trace says where the code was, not what the person who
typed the command should do.

### Asking yes or no

`askYesNo(question, { defaultYes })` writes the question to stderr with a
`[y/N]` or `[Y/n]` hint and reads one line from stdin. An empty answer takes
the default. Otherwise only `y` or `yes` is yes. It is synchronous, so a
caller inside a synchronous loop can ask between two steps. Check
`canPrompt()` first. It is true only when stdin and stderr are both terminals.

### Whose directories

A tool's machine config file and its devlink state live in the config home of
its standalone tier. The vendor and the override variables that move that home
belong to whoever ships the tool, so the tool passes them as a `VendorDirs`:

```ts
import { envVars } from '@osdlc/cli-tool'

const vendorDirs = { vendor: 'com.example', envVars: envVars('EXAMPLE') }
```

`systemDirs(vendorDirs)` resolves them through `@osdlc/tiered-dirs`.

## The command tree

`@osdlc/cli-tool/command` declares a CLI as a tree. Each command declares its
flags, its arguments and its output once. The app routes a command line to the
command, parses it with `defineCli`, runs it, and prints the answer.

```ts
import { z } from 'zod'
import { commandKit, defineApp, outcome } from '@osdlc/cli-tool/command'
import { runMain } from '@osdlc/cli-tool'

const GLOBALS = {
  dir: { kind: 'string', short: 'C', valueName: 'path', help: 'the repository (default: cwd)' },
} as const
const { command, group } = commandKit({ globals: GLOBALS })

const list = command({
  summary: 'the branches, and which are merged',
  flags: { merged: { kind: 'boolean', help: 'only merged branches' } },
  output: z.object({ branches: z.array(z.object({ name: z.string(), merged: z.boolean() })) }),
  kind: 'branches',
  run: async ({ flags, globals }, ctx) => ({ branches: await read(globals.dir ?? ctx.cwd, flags.merged) }),
  text: (o) => o.branches.map((b) => `${b.name}\n`).join(''),
})

const app = defineApp({
  name: 'sweep',
  version: '0.3.0',
  summary: 'say what has been merged and can go away',
  globals: GLOBALS,
  commands: { branch: group({ summary: 'work with branches', default: list, commands: { list } }) },
})

await runMain(app.main, { name: 'sweep' })
```

| A command line | Does |
|---|---|
| `sweep branch` | runs `list`, the group's default, and prints its `text` |
| `sweep -C ../x branch list --json` | prints `{ "schemaVersion": 1, "kind": "branches", "branches": [...] }` |
| `sweep help`, `sweep --help` | lists the top-level commands, one line each |
| `sweep help branch`, `sweep branch --help` | one node: its usage, flags and subcommands |
| `sweep help --depth 2`, `--depth all` | expands that many levels of subcommands |
| `sweep help branch list --full`, `sweep branch list --help --all` | adds the long description, hidden flags, exit codes and examples |
| `sweep help --json` | the same help as one JSON document |
| `sweep schema [command...]` | each command's input JSON Schema (from its flags) and output JSON Schema (from its Zod output) |
| `sweep --version` | `sweep 0.3.0`, or a `version` document with `--json` |

What a command declares:

| Field | Meaning |
|---|---|
| `summary` | one line, for lists |
| `description` | the long explanation, for `help --full`, wrapped at render time |
| `flags`, `positionals` | as for `defineCli`. `json`, `help`, `all` and `version` are the app's |
| `output` | a `z.object`: the `--json` contract and the `schema` output. It may not declare `schemaVersion` or `kind` |
| `kind`, `schemaVersion` | the document's `kind` (default: the path joined with `-`) and version (default 1) |
| `run(input, ctx)` | returns the output, or `outcome(output, exit)` to print it and exit non-zero |
| `text(output, ctx)` | the text form. Default: the output as indented JSON |
| `exits` | the command's own exit codes (1 or 10-63) and their meanings |
| `examples`, `hidden`, `readOnly` | shown under `help --full`; left out of lists; changes nothing |
| `interactive: true` | for a terminal UI or a server: no `output`, and `--json` is refused with exit 2 |

`input` holds `flags`, `globals` (typed by the kit), `positionals` and `rest`,
the words after `--`. `ctx` is the `CliContext` plus `app`, `path`, `json`,
`color`, `width`, and `warn`/`note`, which write `<name>: ...` lines to stderr.
A command writes nothing to stdout itself.

Global flags may come before or after the command word: `sweep -C x branch`
and `sweep branch -C x` are the same. A group's `default` command takes any
word that names no subcommand as a positional, so a root default can take a
directory: `sweep ../repo`.

Errors:

| Thrown from `run` | Prints on stderr | Exit |
|---|---|---|
| a parse error, or `UsageError` | `<name>: <message>`, the usage line and where the help is | 2 |
| `CommandError(message, { exit, hint })` | `<name>: <message>` and the hint | `exit`, default 1 |
| a `Failure`, or an error carrying one | the failure line | its category code (22-25), else 1 |
| anything else | nothing; it propagates to `runMain` | 1 |

`checkOutput: true` on the app checks each output against its schema before
printing it. `runApp` in `@osdlc/cli-tool/testing` always checks a `--json`
answer.

### Commands as files

`loadCommandTree(dir, { summary })` builds the tree from a directory: the
directory tree is the command tree.

| File | Is |
|---|---|
| `commands/serve.ts` | `serve`: its default export, from `defineCommand` |
| `commands/config/get.ts` | `config get` |
| `commands/config/index.ts` | the `config` group's `defineGroup` (summary, order, no commands), or a command that runs as `config` |
| `commands/index.ts` | the root's group declaration, or the root's default command |
| `_helpers.ts`, `.d.ts`, `*.test.ts` | ignored |

```ts
const tree = await loadCommandTree(new URL('./commands/', import.meta.url), { summary: 'sweep' })
const app = defineApp({ name: 'sweep', version, summary: 'sweep', commands: tree })
```

It imports the tool's own files only. `treeFromFiles` takes the same files as
a list, for a bundler that collects the modules itself.

### Shared commands

| Entry | Mount it as | The tool supplies |
|---|---|---|
| `config-command` | `config: configCommands(store)` | a `ConfigStore`: `layers`, `defaultLayer`, `keys`, `list`, `locations`, `set`, `unset` |
| `trust-command` | `trust: trustCommand(service)` | a `TrustService`: `trust`, `untrust`, `show`, `list`, and `scopes` for `--scope` |
| `guide` | `guide: guideCommand(topics, { title })` | `GuideTopic`s: `{ id, title, summary, body(ctx) }` |

Each store method receives the command context, so it can read `ctx.cwd`,
`ctx.env` and the tool's global flags.

- `config` with no subcommand lists. Each writable layer is a flag
  (`--user`, `--project`). A value is read as JSON, else as the bare string.
  An unknown key or a wrong value (`ConfigUsageError` from `set`) exits 2 with a
  did-you-mean. A `get` with no value or an `unset` of a key not set in that
  layer exits 1.
- `trust` answers `{ action, changed, roots }` for every mode, so a script does
  not branch on the flag it passed. `--untrust` with no marker prints the answer
  and exits 1.
- `guide` prints every topic; `guide topics` lists them; `guide <topic>` prints
  one. An unknown topic exits 2.

### Testing

`runApp(app, argv, { cwd, env, terminal })` runs in process and returns
`{ exit, out, err, json() }`. `checkApp(app)` reports a node whose help does
not render or a data command with no output schema. `checkGuide(app)` runs the
checks every guide shares: each topic prints, an unknown topic exits 2,
`guide --help` works, and the prose names no flag that no command takes.

## Runtime

The bin of a CLI built on this runs under node over its built `dist/`, with
`engines.node` declared. A bun program can import the library too. It loads
the same compiled `dist/`.

Nothing in this package touches a `Bun.*` global, because every node-run bin
imports it.

## How it compares

commander, yargs, citty, cac and clipanion parse arguments, and most route
subcommands and render help. They are good at that, and this package does not
replace them. It builds on commander for parsing.

What they do not cover, as far as their documentation shows:

- A stated exit-code rule: 0 for success, 1 for a failed run, 2 for a command
  that cannot run as typed, and a band for the tool's own outcomes.
- Running an installed tool from a development checkout, with link history.
- A JSON document with `schemaVersion` and `kind` for every command, and the
  JSON Schema of each one, generated from the same declaration as the parser.

Where they overlap, the difference is the default. commander offers
`exitOverride` and `configureOutput`, yargs offers `exitProcess(false)`, and
clipanion passes streams in through its context. Each is a setting you turn on.
Here, no stream is written and no `process.exit` is called by default, and a
usage error comes back as a value.

Pick one of the others when you want plugins or shell completion. Pick this
package when you want a CLI you can test end to end in-process, whose flags,
help, JSON output, schemas and exit codes follow one stated rule.

This comparison is from each project's public documentation and may be out of
date. Check their current documentation before you decide.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

Stable: the basics in the root entry, which are the output interface, the
context, the exit codes, `defineCli` and its types, `runMain` and the yes/no
prompt.

Experimental: the `devlink`, `command`, `config-command`, `trust-command`,
`guide` and `testing` entries; the wrapping and color helpers; and
`systemDirs`, `VendorDirs`, `closestMatches` and `didYouMean`, which the root
re-exports from `@osdlc/config-layers`. `TieredDirs`, `envVars` and their types
follow `@osdlc/tiered-dirs`.

The experimental exports of `@osdlc/cli-tool`:

`DEFAULT_WIDTH`, `MAX_WIDTH`, `Terminal`, `VendorDirs`, `closestMatches`, `colorEnabled`, `columns`,
`didYouMean`, `helpWidth`, `systemDirs`, `wrapText`

The experimental exports of `@osdlc/cli-tool/command`:

`App`, `AppSpec`, `BUILTIN_FLAGS`, `Command`, `CommandCommon`, `CommandContext`, `CommandError`,
`CommandFile`, `CommandInput`, `CommandKit`, `CommandResult`, `DataCommand`, `DataCommandSpec`,
`Group`, `GroupSpec`, `HelpEntry`, `HelpEntrySchema`, `HelpExit`, `HelpFlag`, `HelpPositional`,
`InteractiveCommand`, `InteractiveCommandSpec`, `JsonSchema`, `Node`, `Outcome`, `OutputSchema`,
`SchemaEntry`, `UNIVERSAL_EXITS`, `UsageError`, `commandKit`, `defineApp`, `defineCommand`,
`defineGroup`, `isGroup`, `isInteractive`, `loadCommandTree`, `outcome`, `treeFromFiles`

The experimental exports of `@osdlc/cli-tool/config-command`:

`ConfigLocation`, `ConfigSetting`, `ConfigStore`, `ConfigUsageError`, `configCommands`,
`parseConfigValue`

The experimental exports of `@osdlc/cli-tool/trust-command`:

`TrustEntry`, `TrustOutputSchema`, `TrustRequest`, `TrustService`, `trustCommand`

The experimental exports of `@osdlc/cli-tool/guide`:

`GuideOptions`, `GuideOutputSchema`, `GuideTopic`, `guideCommand`

The experimental exports of `@osdlc/cli-tool/testing`:

`AppRun`, `CheckGuideOptions`, `acceptedFlags`, `checkApp`, `checkGuide`, `flagTokens`, `runApp`

The experimental exports of `@osdlc/cli-tool/devlink`:

`CliIo`, `DevlinkError`, `ExecOptions`, `GitHead`, `HISTORY_FILE`, `HOME_FILE`, `HistoryEntry`,
`HistoryEvent`, `HistoryKind`, `InstallInput`, `InstallResult`, `InstalledLink`, `LauncherOptions`,
`LinkInput`, `LinkResult`, `LinkStatus`, `Local`, `OffResult`, `OpOptions`, `ResolveOptions`,
`RunOptions`, `Selected`, `Selection`, `ShimStatus`, `Source`, `StateOptions`, `StatusResult`,
`ToolSpec`, `UseInput`, `UseResult`, `appendHistory`, `clearActive`, `cwdCheckout`, `cwdDevVar`,
`defaultBinDir`, `entryOf`, `envStem`, `execSelection`, `findOnPath`, `gitHead`, `history`,
`historyPath`, `homePath`, `homeVar`, `install`, `isCheckout`, `isOnPath`, `launchLayerVar`,
`launcherCheckout`, `launcherDrift`, `link`, `off`, `pathNames`, `processIo`, `quietVar`,
`readActive`, `readHistory`, `readShimTarget`, `renderLauncher`, `renderShim`, `resolve`,
`runDevCli`, `samePath`, `stateDir`, `status`, `suppressed`, `usage`, `use`, `validateSpec`,
`writeActive`

A test compares each list with the `@experimental` tags in the source.

## Platforms and runtimes

Linux and macOS for the 0.x line. Windows support is planned before 1.0. The
devlink launcher is a POSIX shell script, so `<tool> dev` reports itself
unavailable on Windows and exits 1.

Node.js 22 or later, ESM only. Bun also runs it, through the compiled `dist/`. The tests run
on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
