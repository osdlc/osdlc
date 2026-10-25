# @osdlc/cli-tool

What a standalone CLI needs before it does anything of its own.

It implements the osdlc [CLI interface standard](../../../standards/cli-interface.md):
help with progressive disclosure, `--json` on every command as a versioned
document, `--output jsonl` for lists, a `schema` command, `--version`, fixed
exit codes, and stream discipline. The same command tree can be served to an
agent over MCP and to a local page over HTTP.

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
| `@osdlc/cli-tool/mcp` | The command tree as an MCP server over stdio. Needs `@modelcontextprotocol/sdk` |
| `@osdlc/cli-tool/http` | The command tree over local HTTP, with a token |
| [`@osdlc/cli-tool/devlink`](./devlink/README.md) | Running a system-installed tool from a development checkout, with link history |

The command entries load `zod`, a peer dependency. The root entry does not.
The `mcp` entry also loads `@modelcontextprotocol/sdk`, an optional peer
dependency: install it only in a tool that serves MCP. No other entry loads it.

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

Given a `width`, `defineCli` wraps its help to it and reflows its epilogues
each time it renders help. Without one, commander picks the width (the
terminal's, or 80) and the epilogues print as written, as before.
`wrapText(text, width)` reflows any text. Lines of prose are joined and filled
again, and a line ending in `:` ends its paragraph. These are kept as written:
an indented line, a list item (`- a`, `1. a`), a shell example (`$ cmd`), a
table row (`| a |`), a heading (`# a`), a quote line (`> a`) and a fenced block (``` or ~~~, indented or not). So prose
with names interpolated into it never comes out ragged. Widths are terminal
columns: a wide character counts 2 and an escape sequence nothing, through
`@osdlc/ux`'s `displayWidth`. `helpWidth(columns)` picks the width for a
terminal: its width kept between 40 and 100, or 80 when stdout is not a
terminal. `columns(rows, width)` lays out a two-column list, no line wider
than `width`.

### Terminals and color

`CliContext.terminal` says which streams are terminals and how wide stdout is.
`processContext()` fills it in. A context without it reads as "no terminal".
`colorEnabled(ctx, { json })` says whether stdout gets color. It is
`@osdlc/ux`'s `detectColorLevel` for stdout, which reads `NO_COLOR`,
`FORCE_COLOR`, `TERM=dumb` and whether stdout is a terminal, so a tool and its
terminal UI follow one rule. A JSON answer is never colored. cli-tool adds no
`--color` flag: a tool that declares one passes it as
`colorEnabled(ctx, { override })`, and it wins over the environment. For the
color level as well, call `detectColorLevel` directly.

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
| `sweep branch --output jsonl` | one JSON line per branch, for a command that declares `items` |
| `sweep --version` | `sweep 0.3.0`, or a `version` document with `--json` |

What a command declares:

| Field | Meaning |
|---|---|
| `summary` | one line, for lists |
| `description` | the long explanation, for `help --full`, wrapped at render time |
| `flags`, `positionals` | as for `defineCli`. `json`, `output`, `help`, `all` and `version` are the app's |
| `output` | a `z.object`: the `--json` contract and the `schema` output. It may not declare `schemaVersion` or `kind` |
| `kind`, `schemaVersion` | the document's `kind` (default: the path joined with `-`) and version (default 1) |
| `run(input, ctx)` | returns the output, or `outcome(output, exit)` to print it and exit non-zero |
| `text(output, ctx)` | the text form. Default: the output as indented JSON |
| `exits` | the command's own exit codes (1 or 10-63) and their meanings |
| `examples`, `hidden`, `readOnly` | shown under `help --full`; left out of lists; changes nothing |
| `destructive` | deletes or overwrites something that cannot be got back. MCP's `destructiveHint` |
| `items: { field, kind }` | the array field `--output jsonl` prints one line per element of, and each line's `kind` |
| `events: { schema, kind, text }` | the events a long-running command sends with `ctx.emit` |
| `exposure`, `exposureOf(input)` | `all` (default) or `cli-only`: see [Exposure](#exposure) |
| `interactive: true` | for a terminal UI or a server: no `output`, and `--json` is refused with exit 2 |

`input` holds `flags`, `globals` (typed by the kit), `positionals` and `rest`,
the words after `--`. `ctx` is the `CliContext` plus `app` (the `App`),
`path`, `globals` (the same values as `input.globals`), `json`, `output`, `surface` (`cli`, `mcp` or `http`), `signal`,
`color`, `width`, `emit`, and `warn`/`note`, which write `<name>: ...` lines to
stderr. A command writes nothing to stdout itself.

### Output modes

`--output text|json|jsonl` picks the form. `--output json` is `--json`.
`jsonl` prints one JSON object per line, each with `schemaVersion` and `kind`:

- A command that declares `items: { field: 'branches', kind: 'branch' }`
  prints one `branch` line per element of `output.branches`. The other fields
  of the output are not printed.
- A command that declares `events` prints each event as a line when it is
  sent, then the document as the last line.
- Any other command refuses `jsonl` with exit 2.

A long-running command declares `events` and calls `ctx.emit(event)` as it
goes. In text mode each event is printed with `events.text`; under `--json`
only the document is printed. `ctx.signal` is aborted when the caller cancels:
an MCP cancel, an HTTP client that disconnects, or the `signal` on the
`CliContext`.

Global flags may come before or after the command word: `sweep -C x branch`
and `sweep branch -C x` are the same. A group's `default` command takes any
word that names no subcommand as a positional, so a root default can take a
directory: `sweep ../repo`.

Errors:

| Thrown from `run` | Prints on stderr | Exit |
|---|---|---|
| a parse error, or `UsageError` | `<name>: <message>`, the usage line and where the help is | 2 |
| `CommandError(message, { exit, hint, code })` | `<name>: <message>` and the hint | `exit`, default 1 |
| a `Failure`, or an error carrying one | the failure line | its category code (22-25), else 1 |
| anything else, such as a plain `Error` | `<name>: <message>` | 1 |

A group with no default, run with no command word, is a usage error too
(exit 2): `<name>: '<group>' needs a command` and the group's help. Every
message and hint has terminal controls removed before it is printed, since it
often quotes a file from the repository.

Under `--json` or `--output jsonl`, each of these also prints an error
document on stdout, where a caller reads data:
`{ schemaVersion: 1, kind: "error", code, message, exit, hint }`. `code` is
`usage` for exit 2, the failure's kind for a `Failure`, the `CommandError`'s
`code`, or else `error`. `ErrorDocumentSchema` is its Zod schema, and
`App.call` and the HTTP adapter answer a failed call with the same fields.

`checkOutput: true` on the app checks each output against its schema before
printing it. `runApp` in `@osdlc/cli-tool/testing` always checks a `--json` (or `--output json`)
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

It imports the files under `dir` only, and `dir` must be a `file:` URL or an
absolute path, so the tree never depends on the working directory. Symbolic
links are skipped, and a file or directory name that is not a command word
(letters, digits, `-` and `_`) is an error. `treeFromFiles` takes the same files as
a list, for a bundler that collects the modules itself.

### Shared commands

| Entry | Mount it as | The tool supplies |
|---|---|---|
| `config-command` | `config: configCommands(store)` | a `ConfigStore`: `layers`, `defaultLayer`, `keys`, `list`, `locations`, `set`, `unset`, and optionally `cliOnlyKeys`, `resolveKey` and `explain` |
| `trust-command` | `trust: trustCommand(service)` | a `TrustService`: `trust`, `untrust`, `show`, `list`, and optionally `untrustAll` and `scopes` for `--scope` |
| `guide` | `guide: guideCommand(topics, { title })` | `GuideTopic`s: `{ id, title, summary, body(ctx) }` |

Each store method receives the command context, so it can read `ctx.cwd`,
`ctx.env` and the tool's global flag values in `ctx.globals` (`-C <dir>` is
`ctx.globals.dir`). Pass the app's globals to the command too
(`configCommands(store, { globals })`), so its input is typed against them.

- `config explain <key>` (when the store has `explain`) shows each layer from
  the default up, the value it sets, which layer won and why. A layer marked
  `allowed: false`, such as a user-only key in a project file, is shown as
  ignored. It answers `{ key, value, source, reason, layers }` and exits 1 when
  no layer sets the key.
- `cliOnlyKeys` on the store names keys `set` and `unset` write from the
  command line only, such as `trust`. The adapters refuse a write of one, of
  a key under one or of a key above one. Keys are compared without regard to
  case, spaces or `a[b]` for `a.b`. A store that accepts other spellings
  (aliases, say) gives `resolveKey(key)`, and the check runs on the key it
  names; a key it does not know is refused. When the store lists `keys`, a
  key under none of them is refused too.
- `config` with no subcommand lists. Each writable layer is a flag
  (`--user`, `--project`). A value is read as JSON, else as the bare string; a number too large for JSON (`1e400`) is a usage error.
  An unknown key or a wrong value (`ConfigUsageError` from `set`) exits 2 with a
  did-you-mean. A `get` with no value or an `unset` of a key not set in that
  layer exits 1.
- `trust` answers `{ action, changed, roots }` for every mode, so a script does
  not branch on the flag it passed. `action` names the mode: `trust`,
  `untrust`, `untrust-all`, `show` or `list`. Granting trust is `cli-only`; `--show`,
  `--list`, `--untrust` and `--untrust-all` are open to the adapters.
  `--untrust` removes one grant: the whole-repository one, or with `--scope`
  that scope's. `--untrust-all` (when the service has `untrustAll`) removes
  every grant of the root. Either one with nothing to remove prints the answer
  and exits 1. A `--scope` that is empty, `*` or has controls or space at
  either end is a usage error.
- `guide` prints every topic; `guide topics` lists them; `guide <topic>` prints
  one. An unknown topic exits 2.

## Serving commands to agents and pages

The same tree runs from a JSON object instead of a command line.
`app.call(path, args, ctx, { surface })` checks `args` against the command's
flags and positionals (`app.argsSchema(path)`), runs it, and returns its
document. It never writes to the process streams. The MCP and HTTP adapters
are built on it. Neither takes the app's global flags from a caller: they are
fixed when the server starts, from the command line that started it.

### MCP

```ts
import { mcpCommand } from '@osdlc/cli-tool/mcp'

const app = defineApp({ ..., commands: { ...commands, mcp: mcpCommand({ globals: GLOBALS }) } })
// `sweep -C ../repo mcp` serves the tree over stdio. `--read-only` serves only readOnly commands.
```

Each data command is a tool:

| Tool field | From |
|---|---|
| `name` | the path joined with `_` (`branch_list`), or the app's name for the root |
| `title`, `description` | the command line, and the summary and description |
| `inputSchema` | the command's own flags and positionals |
| `outputSchema`, `structuredContent` | the `--json` document |
| `readOnlyHint`, `destructiveHint` | `readOnly`, `destructive` |

Tool names must be unique once joined: a group `a` with a command `b` and a
root command `a_b`, or a command named after the app, make `mcpTools` and
`createMcpServer` throw, naming both commands. A call to a name that is no
tool is a JSON-RPC request error (`-32602`), as the protocol says.

A failed run is an error result whose text is the error document as JSON
(`code`, `message`, `exit`, `hint`), with `code` and the exit code in `_meta`.
It is not `structuredContent`, because the SDK client checks that against the
tool's output schema even when `isError` is set. A document
with a non-zero exit is an error result that keeps `structuredContent`; the
exit code is in `_meta.exitCode`. Events go to the client as progress
notifications when it asked for progress, and a cancel aborts `ctx.signal`.

`createMcpServer(app, ctx, options)` builds the server without a transport,
for a test or another transport. `serveMcp(app, ctx, options)` serves stdio
until the client goes away. `mcpTools(app, options)` lists the tools.

The entry uses the official `@modelcontextprotocol/sdk` (its low-level
`Server`, since the schemas here are JSON Schema, not Zod). It is an optional
peer dependency. Loading it costs about 100 ms, paid only by `mcp`. Installing
it adds its transitive packages to a tool, so only a tool that serves MCP
should depend on it.

### HTTP

```ts
import { httpApiCommand } from '@osdlc/cli-tool/http'

commands: { ...commands, 'serve-api': httpApiCommand({ globals: GLOBALS }) }
// `sweep serve-api` prints the address and a token made for this run, and a
// `printf ... | curl -H @-` line that keeps the token out of the process list.
```

| Route | Answers |
|---|---|
| `GET /schema` | the callable commands, each with its `args` and output JSON Schema |
| `GET /help[/<command>...]` | the help document; `?depth=n\|all`, `?full` |
| `POST /commands/<command>...` | the `--json` document, from a JSON body of flags and positionals |

A call answers 200 with the document and its exit code in `X-Exit-Code`. A
failure answers the error document, `{ schemaVersion, kind: "error", code, exit, message, hint }`: 400
for wrong arguments, 422 for a failed run, 403 for a `cli-only` command, 404
for no such command.

The server binds 127.0.0.1 only. Every request passes, in order:

1. `Host` names a loopback address (`127.0.0.1`, `localhost`, `[::1]`), so a
   site that rebinds its domain to 127.0.0.1 is refused (403). Given the
   `port` option (`serve-api` gives it), `Host` must name that port too.
2. `Origin`, when sent, is the server's own origin, and `Sec-Fetch-Site` is
   not `cross-site` or `same-site` (403).
3. `Authorization: Bearer <token>` (401, the same for every path; the scheme
   name is case-insensitive). A header,
   so a page on another origin needs a CORS preflight, which is never
   answered. There is no CORS.

The body is read only after these checks, up to 1 MiB (413), and must be
`application/json` (415).

With `Accept: application/x-ndjson`, a call streams: one line per event, then
the document or the error as the last line. A call that fails or is refused
before its first event answers as it would without streaming, with its own
status; only a failure after an event is an in-stream line. Closing the connection aborts
`ctx.signal`. NDJSON rather than Server-Sent Events, because `EventSource`
can only GET and cannot send the token header, while `fetch` can read NDJSON
line by line from a POST.

To serve a page of its own, an app mounts the API under a prefix and shares
its checks:

```ts
const api = createHttpApi(app, { context: { cwd, env }, prefix: '/api', globals })
const server = await serveHttp(async (req) => {
  if (api.handles(req)) return api.fetch(req)
  const refused = api.checkOrigin(req)
  if (refused !== null) return refused
  return page(req) // the app's own sign-in for its page, then api.token for its calls
})
```

### Exposure

A command declares who may call it. `exposure: 'all'` (the default) is the
command line and both adapters. `exposure: 'cli-only'` is the command line
only: such a command is not an MCP tool and is refused over HTTP.
`exposureOf(input)` decides per call, after the input is parsed, for a command
whose risk depends on it. Interactive commands are never exposed.

Changing trust is `cli-only`, because an agent or a web page must not grant
itself trust. The shared `trust` command refuses a grant through the
adapters and allows `--show`, `--list`, `--untrust` and `--untrust-all`. `config set` and
`config unset` refuse a key in the store's `cliOnlyKeys`.

A person-facing page may need to grant trust. Its mount lists the command in
`confirm: [['trust']]`. A call then answers 428 with
`{ kind: "confirm", nonce }`, and runs only when the same request (same path,
same body) is sent again with `X-Confirm: <nonce>` within 60 seconds. A nonce
works once. The page asks the person between the two requests. This stops a
single request from granting trust and makes the page ask; it does not stop a
caller that holds the token from sending both. Mount `confirm` only where the
token reaches nothing but that page. The generic `serve-api` and `mcp`
commands never confirm.

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
`guide`, `testing`, `mcp` and `http` entries; the wrapping and color helpers; and
`systemDirs`, `VendorDirs`, `closestMatches` and `didYouMean`, which the root
re-exports from `@osdlc/config-layers`. `TieredDirs`, `envVars` and their types
follow `@osdlc/tiered-dirs`.

The experimental exports of `@osdlc/cli-tool`:

`DEFAULT_WIDTH`, `MAX_WIDTH`, `Terminal`, `VendorDirs`, `closestMatches`, `colorEnabled`, `columns`,
`didYouMean`, `helpWidth`, `systemDirs`, `wrapText`

The experimental exports of `@osdlc/cli-tool/command`:

`App`, `AppSpec`, `BUILTIN_FLAGS`, `CallOptions`, `CallResult`, `Command`, `CommandCommon`, `CommandContext`, `CommandError`,
`CommandFile`, `CommandInput`, `CommandKit`, `CommandResult`, `DataCommand`, `DataCommandSpec`,
`ErrorDocument`, `ErrorDocumentSchema`, `EventsSpec`, `Exposure`, `Group`, `GroupSpec`, `HelpEntry`, `HelpEntrySchema`, `HelpExit`, `HelpFlag`, `HelpPositional`,
`InteractiveCommand`, `InteractiveCommandSpec`, `JsonSchema`, `Node`, `Outcome`, `OutputMode`,
`OutputSchema`, `SchemaEntry`, `Surface`, `UNIVERSAL_EXITS`, `UsageError`, `commandKit`, `defineApp`, `defineCommand`,
`defineGroup`, `errorDocument`, `isGroup`, `isInteractive`, `loadCommandTree`, `outcome`, `treeFromFiles`

The experimental exports of `@osdlc/cli-tool/config-command`:

`ConfigExplainSchema`, `ConfigLayerValue`, `ConfigLocation`, `ConfigSetting`, `ConfigStore`,
`ConfigUsageError`, `configCommands`, `parseConfigValue`

The experimental exports of `@osdlc/cli-tool/trust-command`:

`TrustEntry`, `TrustOutputSchema`, `TrustRequest`, `TrustService`, `trustCommand`

The experimental exports of `@osdlc/cli-tool/guide`:

`GuideOptions`, `GuideOutputSchema`, `GuideTopic`, `guideCommand`

The experimental exports of `@osdlc/cli-tool/testing`:

`AppRun`, `CheckGuideOptions`, `acceptedFlags`, `checkApp`, `checkGuide`, `flagTokens`, `runApp`

The experimental exports of `@osdlc/cli-tool/mcp`:

`McpOptions`, `McpTool`, `createMcpServer`, `mcpCommand`, `mcpTools`, `serveMcp`, `toolName`

The experimental exports of `@osdlc/cli-tool/http`:

`HttpApi`, `HttpApiOptions`, `HttpServer`, `ServeHttpOptions`, `createHttpApi`, `httpApiCommand`,
`serveHttp`

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
