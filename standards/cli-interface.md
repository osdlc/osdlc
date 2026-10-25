# CLI interface: what every osdlc command line provides

Status: draft.

## Summary

- Every command has help. `help` lists the commands, one line each, and
  expands a command, a depth of nesting or the long explanation only when
  asked. The same help is available as JSON.
- Every command answers `--json` with one document on stdout. The document is
  an object that starts with `schemaVersion` and `kind`. A list also answers
  `--output jsonl`: one object per line, each with `schemaVersion` and `kind`.
- A `schema` command prints each command's input and output as JSON Schema,
  generated from the same declaration the parser and the renderer use.
- `<tool> --version` prints the name and version.
- Exit codes mean the same in every tool: 0 ok, 1 a failed run, 2 a command
  that cannot run as typed, 22-25 a classified failure, 10-63 the tool's own
  outcomes.
- Data goes to stdout. Diagnostics go to stderr. Output to a pipe has no color
  and no prompts. `NO_COLOR` turns color off.
- Anything a person can do in a tool's terminal UI or web view, a command can
  do too.
- A tool may serve its commands to an agent over MCP and to a local page over
  HTTP. They answer the same documents as `--json`.
- A command that changes trust runs from the command line only. No agent or
  web page can grant itself trust.

[`@osdlc/cli-tool`](../packages/ts/cli-tool#readme) implements this standard.
A tool built on its command tree gets every rule below without writing it.

## Rules

### 1. Help on every command, with progressive disclosure

| Command line | Shows |
|---|---|
| `<tool> help`, `<tool> --help` | the top-level commands, one line each, and the global flags |
| `<tool> help <command> [<sub> ...]`, `<tool> <command> --help` | that command: usage, flags, arguments and its subcommands one level down |
| `<tool> help --depth <n>`, `--depth all` | that many levels of subcommands |
| `<tool> help <command> --full`, `<tool> <command> --help --all` | also the long description, hidden flags, exit codes and examples |
| `<tool> help ... --json` | the same content as one JSON document |

Help is wrapped to the terminal width when it is rendered, between 40 and 100
columns, and to 80 columns when stdout is not a terminal. Prose is never
wrapped by hand, since names interpolated into it change the line lengths.

The short help is the default. It names the longer form, so a reader knows
there is more. A usage error prints the usage line and where the help is, not
the whole help, so the error stays easy to find.

### 2. `--json` on every command

Every command that answers with data takes `--json` and prints exactly one
JSON document on stdout:

```json
{ "schemaVersion": 1, "kind": "config-get", "key": "discovery", "value": "git" }
```

- The document is an object, never a bare array or scalar, so it can gain a
  field without breaking a caller.
- `schemaVersion` is an integer. It rises when the document changes
  incompatibly: a field removed, renamed or retyped. Adding an optional field
  does not raise it.
- `kind` names the document. Two commands that print the same shape may share
  a kind.
- The document is the same data the text form shows. The text form may leave
  out detail. It may not show data the document lacks.
- A command that takes over the terminal or runs until stopped (a terminal UI,
  a server) has no JSON form. It refuses `--json` with exit 2.
- `--json` does not change the exit code. A search that matched nothing prints
  its empty document and exits 1, as it would without `--json`.

### 2a. `--output text|json|jsonl`

`--output json` is the same as `--json`. `--output jsonl` prints JSON Lines:
one object per line, nothing else on stdout.

- A command whose answer is a list prints one line per element. Each line is
  the element with `schemaVersion` and `kind` added in front, where `kind`
  names the element (`task`), not the list (`tasks`). Fields of the document
  outside the list are not printed.
- A long-running command that reports as it goes prints one line per event,
  each with its own `kind`, as the event happens, then the document as the
  last line.
- A command with neither refuses `--output jsonl` with exit 2.
- `--json` together with `--output jsonl` is a usage error.
- The exit code is the same as in the other modes.

### 3. A `schema` command

`<tool> schema [<command> ...]` prints the tree under the command named, or the
whole tree, with each command's:

- `input`: a JSON Schema with one property per flag and argument. Each
  property carries its spelling (`x-cli`: `--dir`, `-C`, or a positional
  index).
- `output`: the JSON Schema of its `--json` document, with `schemaVersion`
  and `kind` fixed.

Both are generated from the declaration that parses the input and renders the
output. Neither is written by hand. A tool may also publish the output schemas
as files, generated the same way.

### 4. `--version`

`<tool> --version` prints `<name> <version>` and exits 0. With `--json` it
prints `{ "schemaVersion": 1, "kind": "version", "name": ..., "version": ... }`.

### 5. Exit codes

| Code | Meaning | A script should |
|---|---|---|
| 0 | The command did what it was asked | carry on |
| 1 | A well-formed command failed against the state it found | look at the state |
| 2 | The command cannot run as typed: an unknown flag or command, a missing or extra argument, a bad value, two flags that conflict | fix the command line |
| 10-63 | An outcome the tool defines and documents in its help | act on the outcome |
| 22 | A program the run needs is not installed | install it |
| 23 | A service refused the caller or gave an unusable answer | fix the credentials or the name |
| 24 | There is no repository or remote to work on | run it somewhere else |
| 25 | A service could not be reached or limited the caller | try again later |

A tool's own codes avoid 22-25. Codes from 64 up are taken by `sysexits.h`
and the shell. Each command's help under `--full` lists the codes it can
return. Code uses named constants, never bare numbers.

### 6. Streams

- stdout carries the answer: the text form or the JSON document. Nothing else.
- stderr carries everything else: errors, warnings, progress, notes, and
  context such as which file was read. Each line starts with `<tool>:`, and a
  warning with `<tool>: warning:`.
- An error prints one line saying what went wrong, then a hint when there is
  one. No stack trace.
- A run that prints a document and then fails (exit 1 or a domain code) still
  prints the whole document.

### 7. Non-TTY and color

- Color only when stdout is a terminal. `NO_COLOR` set to anything but the
  empty string turns color off and wins over everything else. `FORCE_COLOR`
  turns it on in a pipe. `TERM=dumb` turns it off. A JSON document is never
  colored.
- No prompt unless stdin and stderr are both terminals. A command that would
  ask takes a flag instead, and without the flag it fails with exit 2 and
  names the flag.
- No spinner or progress redraw when stderr is not a terminal.

### 8. Every interactive action is also a command

A tool with a terminal UI or a web view offers nothing there that a command
cannot do. Each action maps to a named command with the same effect and the
same rules, so a script or an agent never has to drive a UI. A tool keeps the
list of its actions and their commands where a test can check it.

### 9. Shared commands are spelled the same

Where a tool has them, these commands work the same in every tool:

| Command | Does |
|---|---|
| `config [list]`, `config get <key>`, `config set <key> <value>`, `config unset <key>`, `config path` | read and write the tool's layered settings. `--user` or `--project` picks the file |
| `config explain <key>` | show each layer from the default up (default, user file, project file, environment, flags), the value each sets, which one won and why, including a layer that may not set the key. `--json` has the same |
| `trust`, `trust --untrust`, `trust --show`, `trust --list` | record, remove, show or list consent to run a repository's own code |
| `guide [topic]`, `guide topics` | long-form help in Markdown |

### 10. Adapters: MCP and local HTTP

A tool may serve its command tree to other programs. Each adapter is
generated from the same declarations as the command line, so it cannot offer
a command the CLI lacks or answer a different shape.

- **Input.** A call is one JSON object with a property per flag and
  positional, named as the command declares them. It is checked as strictly as
  a command line: an unknown property or a wrong type is a usage error (exit
  2). The tool's global flags (such as `-C <dir>`) are fixed when the server
  starts and are not part of a call.
- **Output.** A call answers the same document `--json` prints. A failure
  carries the exit code, the message and the hint.
- **MCP** (`<tool> mcp`, stdio). Each data command is a tool: its name is the
  command path joined with `_`, its input schema comes from the flags and
  positionals, its output schema and `structuredContent` are the `--json`
  document, and `readOnlyHint` and `destructiveHint` come from the command's
  declaration. Interactive commands are not tools. Events are progress
  notifications. A cancel stops the command.
- **HTTP** (`<tool> serve-api`). `GET /schema`, `GET /help[/<command>...]`
  and `POST /commands/<command>...` with a JSON body. The server:
  - binds 127.0.0.1 only;
  - refuses a `Host` that is not a loopback name, and an `Origin` that is not
    its own, before anything else, against DNS rebinding;
  - requires `Authorization: Bearer <token>`, a token made for each run and
    printed when it starts, never put in a URL or a cookie;
  - reads a body only after those checks, with a size limit;
  - sends no CORS headers.
  A long-running command streams with `Accept: application/x-ndjson`: one
  line per event, then the document. Closing the connection stops it.
- An app may mount the HTTP API under a prefix next to its own page and
  share these checks.

### 11. Exposure: what an adapter may call

Each command is `all` (the command line and the adapters) or `cli-only` (the
command line only). The choice may depend on the input: one call of a
command can be `cli-only` while another is not.

- A command that grants trust, or writes a setting that decides trust (a
  trust policy key), is `cli-only`. An agent or a web page must never be able
  to give itself the right to run a repository's code. Reading trust status
  and removing trust may be exposed.
- An adapter does not list a `cli-only` command and refuses a `cli-only`
  call. MCP and the generic `serve-api` have no way around this.
- A tool's own person-facing page may need to grant trust. Its HTTP mount may
  allow named `cli-only` commands behind a confirmation: the first request
  answers 428 with a one-time nonce, and the command runs only when the same
  request is sent again with that nonce, within a minute. The page asks the
  person between the two. The confirmation does not stop a program that holds
  the token, so the token of such a mount goes only to that page.
- Interactive commands are never exposed.

## Examples

```sh
tooly help                      # the top-level commands
tooly help config --depth 2     # config and everything under it
tooly config get paths.cache --json
tooly schema search             # the input and output schema of `tooly search`
tooly --version
tooly task list --output jsonl  # one `task` object per line
tooly config explain paths      # which layer set paths, and why
tooly mcp                       # the commands as MCP tools, over stdio
tooly serve-api                 # the commands over local HTTP; prints a token
```

A script checks the exit code before reading the document:

```sh
if out=$(tooly search build --json); then
  jq -r '.results[].name' <<<"$out"
fi
```

## Anti-examples

- `--json` that prints a bare array. It cannot gain a field.
- A warning printed to stdout. It breaks `--json` and every pipe.
- A hand-written JSON Schema next to the code that builds the document. They
  drift apart.
- A usage error that exits 1. A script cannot tell "fix the command" from
  "look at the state".
- A key binding in the terminal UI that does something no command can do.
- Help prose wrapped by hand at 80 columns around an interpolated name.
- Color codes in output piped to a file.
- `--output jsonl` lines without `kind`, or a list printed as one array per
  line.
- An MCP tool or HTTP route that grants trust in one call.
- A local HTTP server that trusts loopback alone, or reads a request body
  before it checks the token.
- A token in a URL, where browser history, logs and other users' process
  lists can see it.

## Decisions in this draft

Each of these was a choice. Overturn any of them in review.

1. **Envelope fields at the top, not a wrapper.** The document is the
   command's own object with `schemaVersion` and `kind` added in front, not
   `{ "schemaVersion", "kind", "data": {...} }`. Callers read `.tasks`, not
   `.data.tasks`. The cost is that a command's output may not use either name.
2. **Errors are not JSON.** Under `--json`, an error is a line on stderr and an
   exit code, the same as without it. A structured error document can come
   later if callers need one.
3. **`schemaVersion` starts at 1 per document.** Each kind is versioned on its
   own, so a change to one document does not move the others.
4. **`help` is a command and `--help` is its shorthand.** `<tool> x --help` and
   `<tool> help x` print the same thing.
5. **Streams are NDJSON, not Server-Sent Events.** `EventSource` can only send
   GET and cannot send the token header. `fetch` can read NDJSON line by line
   from a POST, and the lines are the same as `--output jsonl`.
6. **Globals are fixed per server.** An adapter does not let a caller set
   `-C <dir>` or another global flag, so a server answers for the directory it
   was started in.
7. **A non-zero exit with a document is still an answer.** HTTP sends 200 with
   the exit code in `X-Exit-Code`; MCP marks the result an error and keeps the
   document.
