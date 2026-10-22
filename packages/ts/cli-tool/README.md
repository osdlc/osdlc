# @osdlc/cli-tool

What a standalone CLI needs before it does anything of its own.

A command-line tool written in TypeScript tends to repeat the same groundwork:
a way to write output that a test can capture, one rule for exit codes, flags
and help text that agree with each other, and a launcher that can run the tool from
a development checkout. This package holds that groundwork so each tool does not
write it again. It is a library of parts. A tool's own `main` stays its own.

It is for CLIs that other people run on their machines and that you want to test
without spawning a process.

When not to use it:

- You want a framework that discovers and routes subcommands. This package
  declares one command's flags; routing is yours.
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

## Two entries

| Import | What it holds |
|---|---|
| `@osdlc/cli-tool` | The substrate below — output seam, context, exit codes, flag declaration, bin shim |
| [`@osdlc/cli-tool/devlink`](./devlink/README.md) | Running a system-installed tool from a development checkout, with link history |

The tool's project and machine config files are a separate package,
`@osdlc/config-layers`. The root re-exports
its directory and did-you-mean helpers (`systemDirs`, `TieredDirs`,
`envVars`, `closestMatches`, `didYouMean`) and their types.

A bin shim asks devlink which checkout should answer and then hands control to
`main`; `main` reads its config and
writes through the io seam.

## The substrate

### Output goes through `CliIo`

```ts
export interface CliIo {
  stdout(text: string): void
  stderr(text: string): void
}
```

`processIo` writes to the real streams and is the only thing that names one.
`captureIo()` accumulates instead, so a test asserts on output without
monkeypatching a global — a patch that leaks on a missed `finally` corrupts
every other test in the process.

Exit codes are not part of this seam; they are return values. There is no
`stdin` member. Ambient values a command needs beyond output travel in
`CliContext`:

```ts
export interface CliContext {
  io: CliIo
  cwd: string
  env: Record<string, string | undefined>
}
```

`cwd` and `env` arrive as values rather than being read from the process,
which is what lets a test drive a whole command against a temporary
directory. `processContext()` is the real one; `captureContext()` is the
test one.

### Exit codes

| Code | Meaning |
|---|---|
| `EXIT.ok` (0) | The command did what it was asked |
| `EXIT.error` (1) | A well-formed command that failed against the state it found |
| `EXIT.usage` (2) | The command cannot run as typed |
| `EXIT_FAILURE` (22-25) | A classified failure, the same in every tool; see below |
| 10-63 | This tool's own outcomes — `isDomainExit` checks the band; avoid 22-25 |
| 64+ | Not available: `sysexits.h` claims 64-78, the shell claims 126+ |

A script can act on the split: 2 means fix the command line, 1 means look at
the state. A malformed command — an unknown flag or subcommand, a wrong
argument count, a wrong-typed value — is decided from the argument list and
the tool's own schema with nothing read, so re-running it can only fail the
same way. It is the same 2 in every tool, and 2 is the conventional choice:
argparse and most GNU tools already use it.

The band is for outcomes of the work — "nothing to sweep" as against
"something failed to delete" — declared by the tool and documented at its own
`main`. It is not a second spelling of the three universal codes above.

### Failures

A library below the CLI reports a missing tool, a signed-out `gh` or a dead
network as a `Failure` from [`@osdlc/result`](../result#readme): a `kind`, a
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
`CommandFailed`): it prints `<name>: <message> <hint>` and sets the category's
exit code. The code follows the `kind` the thrown failure carries, so it is only
as specific as the layer that threw it: `@osdlc/typed-git`, `@osdlc/typed-gh` and
`@osdlc/code-host` throw the classified failure (a signed-out `gh` or `git push`
is 23), while a bare `CommandFailed` from elsewhere carries only command-seam's
kinds (`not-installed`, `timeout`, ... and a generic `exit`, which is 1).
Classify before throwing if you want more. A `main` that holds a `Result` returns instead of throwing:

```ts
const listed = host.listPrs({})
if (!listed.ok) return failWith(ctx, listed.error, { name: 'sweep' })
```

`failWith` prints the same line and returns the code. The line carries the
message and the hint only; the raw `detail` (a tool's stderr) is left to a
caller that asks for it, since this package has no verbose switch. Any other
thrown error keeps the old behaviour: its message and exit 1.

### Flags are declared, not parsed

`defineCli` builds a [commander](https://github.com/tj/commander.js) command
underneath, so `--flag=value`, short flags, `--no-x` negation and
required-value checking are not reimplemented here. What it adds is the house
contract: nothing writes to a process stream, nothing calls `process.exit`,
and a usage error comes back as a value.

| Kind | Parses to | Notes |
|---|---|---|
| `boolean` | `boolean` | `negatable: true` starts it at `true` and spells it `--no-<name>` |
| `string` | `string`, or `string \| undefined` with no default | `required: true` refuses the run when absent |
| `enum` | one of `choices` | commander rejects anything else |
| `list` | `string[]` | comma-separated and repeatable |
| `count` | `number` | `-vv` is 2 |
| `tristate` | `boolean \| undefined` | `--x`, `--no-x`, or neither |

Keys are camelCase and the flag is the kebab of the key: `binDir` is
`--bin-dir`. `parse` returns one of three states — `ok` with typed values and
positionals, `help` when `--help` was asked for and already written, or
`error` carrying commander's own wording with no prefix, so the caller
decides how to present it.

A flag with no default parses to `undefined` when the command line does not
mention it, and that is load-bearing: a `tristate` or an undefaulted `list` is
how a configuration layer underneath the flags gets to answer. A flag that is
always present would overwrite the configured value on every run.

The declaration is also the help text. A hand-written usage string beside a
hand-rolled `switch` is two things to keep in step, and they drift.

### Two help tiers

A tool with more surface than a first-time reader needs prints a short help by
default and a complete one on request. Both render from the one declaration,
so a flag cannot be in the parser and missing from the complete help.

| Piece | Effect |
|---|---|
| `hidden: true` on a flag | Left out of the short help. Still parsed, and still shown by `help({ all: true })` |
| `shortEpilogue` | Used instead of `epilogue` in the short tier |
| `autoHelp: false` | Commander stops owning `-h, --help`, so the tool can render the tier itself |

`autoHelp: false` is what makes the second tier reachable at all. Commander
acts the moment it reads `--help`, so it can never see `--help --all` as one
thing; a two-tier tool turns it off, declares `help` and its modifier as
ordinary flags, and picks the tier after parsing:

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

### `runMain`

Assigns `process.exitCode` rather than calling `process.exit`, because
exiting outright truncates buffered stdout and the bug only shows under a
pipe. A thrown error becomes one line on stderr and exit 1, and a thrown
failure becomes its line and its category's exit code (see Failures); a stack
trace says where the code was, not what the person who typed the command should
do.

### Asking yes or no

`askYesNo(question, { defaultYes })` writes the question to stderr with a
`[y/N]` or `[Y/n]` hint and reads one line from stdin. An empty answer takes
the default; otherwise only `y` or `yes` is yes. It is synchronous, so a
caller inside a synchronous loop can ask between two steps. Check
`canPrompt()` first: it is true only when stdin and stderr are both terminals.

### Whose directories

A tool's machine config file and its devlink state live in the config home of
its standalone tier. The vendor and the override variables that move that home
belong to whoever ships the tool, so the tool passes them as a `VendorDirs`:

```ts
import { envVars } from '@osdlc/cli-tool'

const vendorDirs = { vendor: 'com.example', envVars: envVars('EXAMPLE') }
```

`systemDirs(vendorDirs)` resolves them through `@osdlc/tiered-dirs`.

## Runtime

The bin of a CLI built on this runs under **node** over its built `dist/`,
with `engines.node` declared. A bun program can import the library too: it
loads the same compiled `dist/`.

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
- A per-repository consent store for running a repository's own scripts.

Where they overlap, the difference is the default. commander offers
`exitOverride` and `configureOutput`, yargs offers `exitProcess(false)`, and
clipanion passes streams in through its context. Each is a setting you turn on.
Here, no stream is written and no `process.exit` is called by default, and a
usage error comes back as a value.

Pick one of the others when you want routing, plugins or shell completion. Pick
this package, alone or under a router, when you want a CLI you can test end to
end in-process, whose flags, help and exit codes follow one stated rule.

This comparison is from each project's public documentation and may be out of
date. Check their current documentation before you decide.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

Stable: the substrate in the root entry, which is the output seam, the context,
the exit codes, `defineCli` and its types, `runMain` and the yes/no prompt.

Experimental: the whole `devlink` entry, and
`systemDirs`, `VendorDirs`, `closestMatches` and `didYouMean`, which the root
re-exports from `@osdlc/config-layers`. `TieredDirs`, `envVars` and their types
follow `@osdlc/tiered-dirs`.

The experimental exports of `@osdlc/cli-tool`:

`VendorDirs`, `closestMatches`, `didYouMean`, `systemDirs`

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
devlink launcher is a POSIX shell script, so it does not run on Windows today.

Node.js 22 or later, ESM only. Bun also runs it, through the compiled `dist/`. The tests run
on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
