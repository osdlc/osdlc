# osdlc-cli-tool

What a standalone Rust CLI needs before it does anything of its own.

The Rust twin of the TypeScript `@osdlc/cli-tool`, over `clap` 4 (derive)
instead of that library's own parser. It keeps what makes osdlc tools agree:
one output seam so tests run in process, one exit-code table, classified
failures with a shared code each, and versioned `--json` documents with an
error document. clap keeps parsing, help text, `--version` and routing.

Stream discipline: results go to stdout, diagnostics to stderr. Exit codes are
return values, never `std::process::exit` calls inside a command.

## Install

The crate is published as `osdlc-cli-tool`, because the name `cli-tool` on crates.io belongs
to another project. Its library is still `cli_tool`, so code says `use cli_tool::...`.

```sh
cargo add osdlc-cli-tool
```

## Example

A small app. One handler serves text and `--json`.

```rust,no_run
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use cli_tool::{
    CommandError, Context, DynReport, Failure, GlobalArgs, HasGlobals, Outcome, Report,
};
use serde::Serialize;

#[derive(Parser)]
#[command(name = "greeter", version = "1.0.0", about = "Greets and counts.")]
struct Cli {
    #[command(flatten)]
    globals: GlobalArgs,
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Greet someone.
    Greet { name: String },
    /// Count the words given.
    Count { words: Vec<String> },
    /// Find words; exits 1 when none match.
    Find { word: String },
}

impl HasGlobals for Cli {
    fn globals(&self) -> &GlobalArgs {
        &self.globals
    }
}

#[derive(Serialize)]
struct Greeting {
    greeting: String,
}

impl Report for Greeting {
    fn kind(&self) -> &str {
        "greeting"
    }
    fn render_text(&self) -> String {
        format!("{}\n", self.greeting)
    }
}

#[derive(Serialize)]
struct Count {
    count: usize,
}

impl Report for Count {
    fn kind(&self) -> &str {
        "count"
    }
    fn render_text(&self) -> String {
        format!("{}\n", self.count)
    }
}

#[derive(Serialize)]
struct Found {
    matches: Vec<String>,
}

impl Report for Found {
    fn kind(&self) -> &str {
        "found"
    }
    fn render_text(&self) -> String {
        format!("{} matches\n", self.matches.len())
    }
}

// Each arm returns its own report type, boxed. `report.with_exit(code)` prints
// like a success; only the exit code differs.
fn handle(cli: &Cli, ctx: &mut Context<'_>) -> Result<Outcome, CommandError> {
    let report: Box<dyn DynReport> = match &cli.command {
        Cmd::Greet { name } if name.is_empty() => {
            return Err(Failure::new("not-found", "No one to greet.")
                .with_hint("Name someone.")
                .into());
        }
        Cmd::Greet { name } => {
            let who = ctx.env("GREETER_SALUTATION").unwrap_or("Hello");
            Box::new(Greeting { greeting: format!("{who}, {name}!") })
        }
        Cmd::Count { words } => Box::new(Count { count: words.len() }),
        Cmd::Find { .. } => return Ok(Found { matches: vec![] }.with_exit(1)),
    };
    Ok(report.into())
}

fn main() -> ExitCode {
    cli_tool::run_main(|ctx| cli_tool::run::<Cli, _, _, _>(std::env::args_os(), ctx, handle))
}
```

`greeter greet ada --json` prints, on stdout:

```json
{
  "schemaVersion": 1,
  "kind": "greeting",
  "greeting": "Hello, ada!"
}
```

`greeter find x --json` prints a `"kind": "found"` document and exits 1; a
result with an exit code is not an error document. A handler with one report
type may return it directly (`Ok(report)`). One that writes all of stdout
itself (a hook's reply, say) returns `Outcome::written(exit)`, and `run` prints
nothing more, under `--json` too.

A failure prints `greeter: No one to greet. Name someone.` on stderr and exits
23. With `--json`, the error document is also printed on stdout:

```json
{
  "schemaVersion": 1,
  "kind": "error",
  "code": "not-found",
  "message": "No one to greet.",
  "exit": 23,
  "hint": "Name someone."
}
```

A payload may not have a field named `schemaVersion` or `kind`, the envelope's
keys: most parsers would read a duplicate key as the payload's, so `--json`
fails the run (exit 1, naming the report and the field) instead.

An `io::Error` does not convert into `CommandError` with `?`, since it does not
say what failed:

- From the handler's own work, say what was being done:
  `.map_err(|e| Failure::io("cannot read settings.toml", &e))?` (kind `io`,
  exit 1, a closed pipe included).
- From a write to `ctx.io`, the tool's own output, use
  `.map_err(CommandError::Io)?`. A closed pipe there (`tool | head`) ends the
  run quietly with exit 0; any other error is a failed run. A closed stdout
  while `run` prints keeps the run's exit code.

`run_main` does not lock stdout or stderr while the handler runs. Each write
takes the stream's lock for that write, so a worker thread or a dependency's
logger can print too.

A test runs the same app in process with
`cli_tool::testing::run_app(argv, RunOptions::default(), |argv, ctx| ...)` and
gets back stdout, stderr and the exit code.

A command line clap rejects exits 2 with clap's message on stderr. With a
`--json` token before any `--`, the error document (`"code": "usage"`) is also
printed on stdout.

## `help --json` and `schema`

clap keeps `--help`. A tool that an agent drives adds two commands of its own:
`help`, the command tree as data (`help [command...] [--depth <n|all>] [--full]`,
kind `help`), and `schema`, each command's input and output JSON Schema
(`schema [command...]`, kind `schema`). It sets `disable_help_subcommand`, so
its `help` replaces clap's, and registers what clap cannot know, the document
each command prints, in a `CommandDocs`:

```rust,no_run
use clap::{CommandFactory, Parser, Subcommand};
use cli_tool::{
    CommandDoc, CommandDocs, CommandError, Context, DynReport, GlobalArgs, HasGlobals, HelpArgs,
    Outcome, Report, SchemaArgs, help_doc, help_report, payload_schema, schema_doc,
    schema_report,
};
use serde::Serialize;

#[derive(Parser)]
#[command(name = "greeter", version = "1.0.0", disable_help_subcommand = true)]
struct Cli {
    #[command(flatten)]
    globals: GlobalArgs,
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Greet someone.
    Greet { name: String },
    /// Show help for a command, as text or JSON.
    Help(HelpArgs),
    /// Print each command's input and output JSON Schema.
    Schema(SchemaArgs),
}

impl HasGlobals for Cli {
    fn globals(&self) -> &GlobalArgs {
        &self.globals
    }
}

#[derive(Serialize, schemars::JsonSchema)]
struct Greeting {
    greeting: String,
}

impl Report for Greeting {
    fn kind(&self) -> &str {
        "greeting"
    }
    fn render_text(&self) -> String {
        format!("{}\n", self.greeting)
    }
}

fn docs() -> CommandDocs {
    CommandDocs::default()
        .with(help_doc())
        .with(schema_doc())
        .with(
            CommandDoc::new(&["greet"], "greeting", 1, payload_schema::<Greeting>())
                .read_only()
                .exit(1, "no one to greet")
                .example("greet ada"),
        )
}

fn handle(cli: &Cli, _: &mut Context<'_>) -> Result<Outcome, CommandError> {
    let version = env!("CARGO_PKG_VERSION");
    let report: Box<dyn DynReport> = match &cli.command {
        Cmd::Greet { name } => Box::new(Greeting { greeting: format!("Hello, {name}!") }),
        Cmd::Help(args) => Box::new(help_report(&Cli::command(), version, args, &docs())?),
        Cmd::Schema(args) => Box::new(schema_report(&Cli::command(), version, args, &docs())?),
    };
    Ok(report.into())
}
```

A `CommandDoc` gives a command's `kind` and `schemaVersion`, the JSON Schema of
its payload (`payload_schema::<T>()`, derived with schemars), its own exit codes
and examples (written without the tool's name), whether it changes nothing
under any flag (`read_only`), and the other documents a flag makes it print
(`alternate(kind, schema)`). `document_schema` adds the envelope's
`schemaVersion` and `kind` to the payload schema, as a `oneOf` when there are
alternates; two of a command's payloads that define one `$defs` name
differently are an error, so rename one of the types. A command's input
schema comes from its clap arguments (`input_schema`). The functions under
both, `help_entry`, `render_help` and `schema_entries`, are public for a tool
that serves the same data another way.

`help --full` lists a command's exit codes: the universal ones, then its own,
each replacing the universal row of its code. A tool that returns only some
failure-class codes (22 to 25), or none, names them with
`CommandDocs::failure_exits(&[...])` so help lists only those, plus 0, 1 and 2.

The error document is published once, not per command: `schema` ends with an
`error` entry (kind `error`, no input), which `schema error` prints alone
unless the tool has a top-level command or alias of that name. Its schema comes
from `ErrorDocument` (`error_schema()`). Each command's `output` stays its
success document's, and the help of `--json` points at `schema error`.

`help` text is wrapped to 80 columns, and `schema` prints the same JSON with or
without `--json`. `--depth` takes a number or `all`; anything else is a usage
error (exit 2).

## Exit codes

| Code | Name | Meaning |
|---|---|---|
| 0 | `Exit::Ok` | The command did what it was asked |
| 1 | `Exit::Error` | A well-formed command that failed against the state it found |
| 2 | `Exit::Usage` | The command cannot run as typed (clap's parse errors, `CommandError::Usage`) |
| 22 | `FailureClass::MissingTool` | A needed program is not installed or cannot be run |
| 23 | `FailureClass::Service` | A service refused the caller or answered unusably |
| 24 | `FailureClass::Repository` | No repository or remote to work on |
| 25 | `FailureClass::Unreachable` | The service could not be reached or limited the caller; try again later |
| 10-63 | | A tool's own outcomes (`is_domain_exit`); avoid 22-25 |

## What is ported

| `@osdlc/cli-tool` | Rust twin |
|---|---|
| `io.ts` `CliIo`, `captureIo` | ported: `Io`, `CapturedIo` |
| `io.ts` `CliContext`, `processContext`, `captureContext` | ported: `Context` (cwd, env lookup, every variable that is UTF-8 through `vars()`, stdout-is-terminal) |
| `exit.ts` | ported: `Exit`, `DOMAIN_EXIT_*`, `is_domain_exit` |
| `failure.ts` table, `EXIT_FAILURE`, `exitCodeFor`, `renderFailure`, `renderError` | ported: `FailureClass`, `EXIT_*`, `Failure`, `render_error` |
| `safe.ts` | ported: `safe`, `safe_line` |
| `command/error.ts` error document, versioned envelope | ported: `ErrorDocument`, `envelope_json`, `Report` |
| `run-main.ts`, broken-pipe handling | ported: `run_main`, `exit_code`, `settle`; a closed pipe on the tool's own output is quiet |
| `testing.ts` `runApp` | ported: `testing::run_app` |
| Argument parser, `--help`, subcommand routing, `--version` | clap provides |
| `--version` text | clap provides (`#[command(version)]`) |
| Did-you-mean on unknown commands | clap provides |
| `outcome(output, exit)` | ported: `Report::with_exit`, `Outcome` |
| Per-command output types | ported as `DynReport`, so subcommands return different report types; their schemas are registered in `CommandDocs` |
| `--json` error document for usage errors | ported: detected from the raw argv, since parsing failed |
| `command/help.ts` `HelpEntry`, `helpEntry`, `renderHelp`, `UNIVERSAL_EXITS` | ported: `HelpEntry`, `help_entry`, `render_help`, `UNIVERSAL_EXITS`, over clap's command tree |
| `help` command, `help --json` (`--depth`, `--full`) | ported: `HelpArgs`, `help_report`, `HelpReport`; a tool adds the variant |
| `command/schema.ts` `inputSchema`, `documentSchema`; the `schema` command | ported: `input_schema`, `document_schema`, `schema_entries`, `SchemaArgs`, `schema_report`, `SchemaReport`; output schemas from schemars, registered per command in `CommandDocs` |
| `colorEnabled`, terminal width, abort signal | left for later |
| `--version --json`, `--output jsonl`, `checkApp`, `checkGuide` | left for later |
| `config`, `trust`, `guide`, `mcp`, `http`, `devlink`, `prompt`, `where`, `wrap`, `stamp-version`, `define-cli` | left out |

## Existing crates considered

| Piece | Crates looked at | Why it stays hand-written |
|---|---|---|
| Output seam and in-process test run (`Io`, `Context`, `testing::run_app`) | `assert_cmd`, `trycmd`, `snapbox` | They test a built binary in a child process, and none hands a command its streams, directory and environment as values |
| Exit-code table and failure classes | `proc-exit`, `sysexits`, `exitcode` | They supply the `sysexits.h` codes 64 to 78, the range this table leaves alone, and none maps a failure kind to a code |
| `--json` envelope and error document | `miette` (its JSON handler), `axocli` | `miette` writes a different error object with no exit code and nothing for a result, and `axocli` ends the process with `std::process::exit` |
| Escape stripping (`safe`, `safe_line`) | `strip-ansi-escapes`, `anstream`, `console` | With each, a title sequence that is never closed removes every line after it, and `safe` ends the sequence at the end of its line |
| Broken pipe in `run_main` | `sigpipe` | It restores the default `SIGPIPE`, which kills the process at its first write to a closed pipe, and `run_main` ends the run quietly with the exit code it had |

Checked 2026-11-16.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
