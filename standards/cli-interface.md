# CLI interface: what every osdlc command line provides

Status: draft.

## Summary

- Every command has help. `help` lists the commands, one line each, and
  expands a command, a depth of nesting or the long explanation only when
  asked. The same help is available as JSON.
- Every command answers `--json` with one document on stdout. The document is
  an object that starts with `schemaVersion` and `kind`.
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
| `trust`, `trust --untrust`, `trust --show`, `trust --list` | record, remove, show or list consent to run a repository's own code |
| `guide [topic]`, `guide topics` | long-form help in Markdown |

## Examples

```sh
tooly help                      # the top-level commands
tooly help config --depth 2     # config and everything under it
tooly config get paths.cache --json
tooly schema search             # the input and output schema of `tooly search`
tooly --version
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
