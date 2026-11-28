//! The library through its public surface, on small clap apps.

use std::io::{self, Write};

use clap::{CommandFactory, Parser, Subcommand};
use cli_tool::testing::{AppRun, RunOptions, run_app};
use cli_tool::{
    CapturedIo, CommandDoc, CommandDocs, CommandError, Context, DynReport, ErrorDocument, Failure,
    GlobalArgs, HasGlobals, HelpArgs, HelpReport, Outcome, Report, SchemaArgs, SchemaReport,
    document_schema, help_doc, help_report, payload_schema, schema_doc, schema_report,
};
use serde::Serialize;

#[derive(Parser)]
#[command(name = "greeter", version = "1.2.3", about = "Greets and counts.")]
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
    /// Fail with a classified failure of this kind.
    Fail { kind: String },
    /// Fail with a usage error found after parsing.
    Misuse,
    /// Fail with a code of the tool's own.
    Custom,
    /// Report the working directory.
    Where,
    /// Report one struct, exiting 1 as a query with no match does.
    Missing,
    /// Report another struct, exiting 12.
    Stats,
    /// Write to stdout through the context, then report.
    Pipe,
    /// Read a file.
    Read { path: String },
    /// Write to a helper process that has gone away.
    Feed,
    /// Report a payload with a field named like one of the envelope's.
    Clash,
    /// Write stdout itself, in a format of its own, and exit 3.
    Own,
}

impl HasGlobals for Cli {
    fn globals(&self) -> &GlobalArgs {
        &self.globals
    }
}

#[derive(Serialize)]
#[serde(untagged)]
enum Output {
    Greeting { greeting: String },
    Count { count: usize },
    Where { cwd: String },
}

impl Report for Output {
    fn kind(&self) -> &str {
        match self {
            Output::Greeting { .. } => "greeting",
            Output::Count { .. } => "count",
            Output::Where { .. } => "where",
        }
    }
    fn render_text(&self) -> String {
        match self {
            Output::Greeting { greeting } => format!("{greeting}\n"),
            Output::Count { count } => format!("{count}\n"),
            Output::Where { cwd } => format!("{cwd}\n"),
        }
    }
}

#[derive(Serialize)]
struct Matches {
    matches: Vec<String>,
}

impl Report for Matches {
    fn kind(&self) -> &str {
        "matches"
    }
    fn render_text(&self) -> String {
        format!("{} matches\n", self.matches.len())
    }
}

#[derive(Serialize)]
struct Stats {
    files: u32,
}

impl Report for Stats {
    fn kind(&self) -> &str {
        "stats"
    }
    fn schema_version(&self) -> u32 {
        3
    }
    fn render_text(&self) -> String {
        format!("{} files\n", self.files)
    }
}

#[derive(Serialize)]
struct Clash {
    kind: String,
}

impl Report for Clash {
    fn kind(&self) -> &str {
        "check"
    }
    fn render_text(&self) -> String {
        format!("{}\n", self.kind)
    }
}

/// Boxing as [`DynReport`] lets the arms return different report types.
fn handle(cli: &Cli, ctx: &mut Context<'_>) -> Result<Outcome, CommandError> {
    let boxed: Box<dyn DynReport> = match &cli.command {
        Cmd::Missing => return Ok(Matches { matches: vec![] }.with_exit(1)),
        Cmd::Stats => return Ok(Stats { files: 4 }.with_exit(12)),
        Cmd::Own => {
            writeln!(ctx.io.out, "{{\"own\":true}}").map_err(CommandError::Io)?;
            return Ok(Outcome::written(3));
        }
        Cmd::Count { words } => Box::new(Stats {
            files: words.len() as u32,
        }),
        Cmd::Clash => Box::new(Clash {
            kind: "command".into(),
        }),
        _ => Box::new(handle_one(cli, ctx)?),
    };
    Ok(boxed.into())
}

fn handle_one(cli: &Cli, ctx: &mut Context<'_>) -> Result<Output, CommandError> {
    match &cli.command {
        Cmd::Greet { name } => {
            let who = ctx.env("SALUTATION").unwrap_or("Hello");
            Ok(Output::Greeting {
                greeting: format!("{who}, {name}!"),
            })
        }
        Cmd::Count { words } => Ok(Output::Count { count: words.len() }),
        Cmd::Missing | Cmd::Stats | Cmd::Clash | Cmd::Own => unreachable!("handled by `handle`"),
        Cmd::Fail { kind } => Err(Failure::new(kind, format!("{kind} happened."))
            .with_hint("Try again.")
            .with_detail("raw output")
            .into()),
        Cmd::Misuse => Err(CommandError::Usage("--a and --b exclude each other".into())),
        Cmd::Custom => Err(CommandError::Coded {
            code: "nothing-to-do".into(),
            message: "Nothing to do.".into(),
            exit: 10,
            hint: None,
        }),
        Cmd::Where => Ok(Output::Where {
            cwd: ctx.cwd.display().to_string(),
        }),
        Cmd::Pipe => {
            writeln!(ctx.io.out, "partial").map_err(CommandError::Io)?;
            Ok(Output::Count { count: 0 })
        }
        Cmd::Read { path } => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| Failure::io(format!("cannot read {path}"), &e))?;
            Ok(Output::Count { count: text.len() })
        }
        Cmd::Feed => {
            // What writing to the stdin of a child that has exited returns.
            let gone = io::Error::from(io::ErrorKind::BrokenPipe);
            Err(Failure::io("cannot write to the helper", &gone).into())
        }
    }
}

fn app(argv: &[&str]) -> AppRun {
    run_with(argv, RunOptions::default())
}

fn run_with(argv: &[&str], options: RunOptions) -> AppRun {
    run_app(argv, options, |argv, ctx| {
        cli_tool::run::<Cli, _, _, _>(argv.iter().copied(), ctx, handle)
    })
}

#[test]
fn a_written_outcome_prints_nothing_more() {
    for argv in [&["greeter", "own"][..], &["greeter", "own", "--json"]] {
        let run = app(argv);
        assert_eq!(
            (run.exit, run.out.as_str(), run.err.as_str()),
            (3, "{\"own\":true}\n", ""),
            "{argv:?}"
        );
    }
}

#[test]
fn text_goes_to_stdout_and_nothing_to_stderr() {
    let run = app(&["greeter", "greet", "ada"]);
    assert_eq!(
        (run.exit, run.out.as_str(), run.err.as_str()),
        (0, "Hello, ada!\n", "")
    );
}

#[test]
fn json_is_the_versioned_envelope_on_stdout() {
    let run = app(&["greeter", "greet", "ada", "--json"]);
    assert_eq!(run.exit, 0);
    assert_eq!(
        run.out,
        "{\n  \"schemaVersion\": 1,\n  \"kind\": \"greeting\",\n  \"greeting\": \"Hello, ada!\"\n}\n"
    );
    assert_eq!(run.err, "");
}

#[test]
fn the_global_flag_works_before_the_subcommand() {
    let run = app(&["greeter", "--json", "count", "a", "b"]);
    let doc: serde_json::Value = run.json().unwrap();
    assert_eq!(doc["kind"], "stats");
    assert_eq!(doc["files"], 2);
}

#[test]
fn the_context_supplies_env_and_cwd() {
    let dir = tempfile::tempdir().unwrap();
    let options = RunOptions::default()
        .cwd(dir.path())
        .env("SALUTATION", "Hi");
    assert_eq!(
        run_with(&["greeter", "greet", "x"], options.clone()).out,
        "Hi, x!\n"
    );
    assert_eq!(
        run_with(&["greeter", "where"], options).out,
        format!("{}\n", dir.path().display())
    );
}

#[test]
fn each_failure_class_exits_its_code_with_a_line_on_stderr() {
    for (kind, code) in [
        ("not-installed", 22),
        ("not-authenticated", 23),
        ("not-a-repo", 24),
        ("rate-limited", 25),
        ("spawn", 1),
    ] {
        let run = app(&["greeter", "fail", kind]);
        assert_eq!(run.exit, code, "{kind}");
        assert_eq!(run.err, format!("greeter: {kind} happened. Try again.\n"));
        assert_eq!(run.out, "", "{kind}");
    }
}

#[test]
fn under_json_a_failure_prints_the_error_document_on_stdout() {
    let run = app(&["greeter", "fail", "not-installed", "--json"]);
    assert_eq!(run.exit, 22);
    assert_eq!(
        run.out,
        "{\n  \"schemaVersion\": 1,\n  \"kind\": \"error\",\n  \"code\": \"not-installed\",\n  \"message\": \"not-installed happened.\",\n  \"exit\": 22,\n  \"hint\": \"Try again.\"\n}\n"
    );
    assert_eq!(run.err, "greeter: not-installed happened. Try again.\n");
    let doc: ErrorDocument = run.json().unwrap();
    assert_eq!(doc.exit, 22);
}

#[test]
fn an_error_document_without_a_hint_has_no_hint_key() {
    let run = app(&["greeter", "custom", "--json"]);
    assert_eq!(run.exit, 10);
    assert_eq!(
        run.out,
        "{\n  \"schemaVersion\": 1,\n  \"kind\": \"error\",\n  \"code\": \"nothing-to-do\",\n  \"message\": \"Nothing to do.\",\n  \"exit\": 10\n}\n"
    );
}

#[test]
fn a_usage_error_found_by_the_handler_exits_2() {
    let run = app(&["greeter", "misuse", "--json"]);
    assert_eq!(run.exit, 2);
    assert_eq!(run.err, "greeter: --a and --b exclude each other\n");
    let doc: ErrorDocument = run.json().unwrap();
    assert_eq!((doc.code.as_str(), doc.exit), ("usage", 2));
}

#[test]
fn a_clap_usage_error_exits_2_with_the_message_on_stderr_and_no_json_flag_nothing_on_stdout() {
    for argv in [
        vec!["greeter", "--nope"],
        vec!["greeter", "nope"],
        vec!["greeter", "greet"],
        vec!["greeter"],
    ] {
        let run = app(&argv);
        assert_eq!(run.exit, 2, "{argv:?}");
        assert_eq!(run.out, "", "{argv:?}");
        assert!(!run.err.is_empty(), "{argv:?}");
    }
    assert!(app(&["greeter", "--nope"]).err.contains("--nope"));
}

#[test]
fn help_and_version_exit_0_on_stdout() {
    let help = app(&["greeter", "--help"]);
    assert_eq!(help.exit, 0);
    assert!(help.out.contains("Greets and counts."), "{}", help.out);
    assert!(help.out.contains("--json"));
    assert_eq!(help.err, "");

    let sub = app(&["greeter", "greet", "--help"]);
    assert_eq!(sub.exit, 0);
    assert!(sub.out.contains("Greet someone"));

    let version = app(&["greeter", "--version"]);
    assert_eq!(
        (version.exit, version.out.as_str(), version.err.as_str()),
        (0, "greeter 1.2.3\n", "")
    );
}

/// A stream whose reader has gone away.
struct Closed;

impl Write for Closed {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::from(io::ErrorKind::BrokenPipe))
    }
    fn flush(&mut self) -> io::Result<()> {
        Err(io::Error::from(io::ErrorKind::BrokenPipe))
    }
}

fn with_closed_stdout(argv: &[&str]) -> (i32, String) {
    let mut captured = CapturedIo::default();
    let mut out = Closed;
    let code = {
        let mut ctx = Context::new(&mut out, &mut captured.err);
        cli_tool::run::<Cli, _, _, _>(argv.iter().copied(), &mut ctx, handle)
    };
    (code, captured.err_text())
}

#[test]
fn a_closed_stdout_is_a_quiet_success() {
    for argv in [
        vec!["greeter", "greet", "ada"],
        vec!["greeter", "greet", "ada", "--json"],
        vec!["greeter", "--help"],
        vec!["greeter", "--version"],
        vec!["greeter", "pipe"],
    ] {
        assert_eq!(with_closed_stdout(&argv), (0, String::new()), "{argv:?}");
    }
}

#[test]
fn a_closed_stdout_does_not_change_a_failing_code() {
    let (code, err) = with_closed_stdout(&["greeter", "fail", "network", "--json"]);
    assert_eq!(code, 25);
    assert_eq!(err, "greeter: network happened. Try again.\n");
    assert_eq!(with_closed_stdout(&["greeter", "nope"]).0, 2);
}

#[test]
fn a_closed_stdout_keeps_an_exit_code_already_decided() {
    assert_eq!(
        with_closed_stdout(&["greeter", "missing"]),
        (1, String::new())
    );
    assert_eq!(
        with_closed_stdout(&["greeter", "stats", "--json"]),
        (12, String::new())
    );
}

#[test]
fn a_handlers_own_io_error_is_a_failed_run_not_an_output_failure() {
    let argv = ["greeter", "read", "/nonexistent/cli-tool-test"];
    let run = app(&argv);
    assert_eq!(run.exit, 1);
    assert!(
        run.err
            .starts_with("greeter: cannot read /nonexistent/cli-tool-test: "),
        "{}",
        run.err
    );
    assert!(!run.err.contains("output failed"), "{}", run.err);

    let doc: ErrorDocument = app(&[&argv[..], &["--json"]].concat()).json().unwrap();
    assert_eq!((doc.code.as_str(), doc.exit), ("io", 1));
}

#[test]
fn a_closed_pipe_in_a_handlers_own_work_is_a_failed_run_not_a_quiet_success() {
    let run = app(&["greeter", "feed"]);
    assert_eq!(run.exit, 1);
    assert!(
        run.err.starts_with("greeter: cannot write to the helper: "),
        "{}",
        run.err
    );
}

/// A stream that fails in a way other than a closed pipe.
struct Full;

impl Write for Full {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::other("disk full"))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn another_write_error_is_a_failed_run() {
    let mut captured = CapturedIo::default();
    let mut out = Full;
    let code = {
        let mut ctx = Context::new(&mut out, &mut captured.err);
        cli_tool::run::<Cli, _, _, _>(["greeter", "greet", "ada"], &mut ctx, handle)
    };
    assert_eq!(code, 1);
    assert!(captured.err_text().contains("disk full"));
}

#[test]
fn a_result_with_an_exit_code_prints_normally_and_exits_with_it() {
    let text = app(&["greeter", "missing"]);
    assert_eq!(
        (text.exit, text.out.as_str(), text.err.as_str()),
        (1, "0 matches\n", "")
    );

    let json = app(&["greeter", "missing", "--json"]);
    assert_eq!(json.exit, 1);
    assert_eq!(
        json.out,
        "{\n  \"schemaVersion\": 1,\n  \"kind\": \"matches\",\n  \"matches\": []\n}\n"
    );
    assert_eq!(json.err, "");
}

#[test]
fn a_payload_field_named_like_one_of_the_envelopes_is_a_failed_run_under_json() {
    let text = app(&["greeter", "clash"]);
    assert_eq!((text.exit, text.out.as_str()), (0, "command\n"));

    let json = app(&["greeter", "clash", "--json"]);
    assert_eq!(json.exit, 1);
    assert!(json.err.contains("`check`"), "{}", json.err);
    assert!(json.err.contains("`kind`"), "{}", json.err);
    // Stdout holds the error document alone, not a document with two `kind`s.
    let doc: ErrorDocument = json.json().unwrap();
    assert_eq!((doc.code.as_str(), doc.exit), ("error", 1));
}

#[test]
fn subcommands_may_return_different_report_types() {
    let stats = app(&["greeter", "stats"]);
    assert_eq!((stats.exit, stats.out.as_str()), (12, "4 files\n"));

    let json = app(&["greeter", "stats", "--json"]);
    assert_eq!(json.exit, 12);
    assert_eq!(
        json.out,
        "{\n  \"schemaVersion\": 3,\n  \"kind\": \"stats\",\n  \"files\": 4\n}\n"
    );

    let greet = app(&["greeter", "greet", "ada", "--json"]);
    assert_eq!(
        (
            greet.exit,
            greet.json::<serde_json::Value>().unwrap()["kind"].clone()
        ),
        (0, "greeting".into())
    );
}

#[test]
fn a_clap_usage_error_under_json_also_prints_the_error_document() {
    let run = app(&["greeter", "--json", "nope"]);
    assert_eq!(run.exit, 2);
    assert!(run.err.starts_with("error:"));
    let doc: ErrorDocument = run.json().unwrap();
    assert_eq!((doc.code.as_str(), doc.exit), ("usage", 2));
    assert!(doc.message.contains("nope"));
    assert!(doc.hint.unwrap().contains("Usage:"));

    let flag_after = app(&["greeter", "greet", "--json"]);
    assert_eq!(flag_after.exit, 2);
    assert_eq!(flag_after.json::<ErrorDocument>().unwrap().code, "usage");
}

#[test]
fn json_after_a_separator_does_not_ask_for_a_document() {
    let run = app(&["greeter", "greet", "--", "--json"]);
    assert_eq!(run.exit, 0);
    let run = app(&["greeter", "--bogus", "--", "--json"]);
    assert_eq!((run.exit, run.out.as_str()), (2, ""));
}

/// A tool that adds `help` and `schema` to its own commands.
#[derive(Parser)]
#[command(
    name = "docs",
    version = "0.4.0",
    about = "Describes itself.",
    disable_help_subcommand = true
)]
struct Documented {
    #[command(flatten)]
    globals: GlobalArgs,
    #[command(subcommand)]
    command: DocCmd,
}

#[derive(Subcommand)]
enum DocCmd {
    /// Greet someone.
    Greet { name: String },
    /// Count the words given.
    ///
    /// Each word is one argument, so quote a phrase to count it once.
    Count {
        words: Vec<String>,
        /// How to print the count
        #[arg(long, default_value = "plain")]
        style: String,
    },
    /// Show help for a command, as text or JSON.
    Help(HelpArgs),
    /// Print each command's input and output JSON Schema.
    Schema(SchemaArgs),
}

impl HasGlobals for Documented {
    fn globals(&self) -> &GlobalArgs {
        &self.globals
    }
}

fn documented_docs() -> CommandDocs {
    CommandDocs::default()
        .with(help_doc())
        .with(schema_doc())
        .with(
            CommandDoc::new(&["greet"], "greeting", 1, payload_schema::<Greeting>())
                .read_only()
                .example("greet ada"),
        )
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

fn handle_documented(cli: &Documented, _: &mut Context<'_>) -> Result<Outcome, CommandError> {
    let root = Documented::command();
    let docs = documented_docs();
    let report: Box<dyn DynReport> = match &cli.command {
        DocCmd::Greet { name } => Box::new(Greeting {
            greeting: format!("Hello, {name}!"),
        }),
        DocCmd::Count { words, .. } => Box::new(Stats {
            files: words.len() as u32,
        }),
        DocCmd::Help(args) => Box::new(help_report(&root, "0.4.0", args, &docs)?),
        DocCmd::Schema(args) => Box::new(schema_report(&root, "0.4.0", args, &docs)?),
    };
    Ok(report.into())
}

fn documented(argv: &[&str]) -> AppRun {
    run_app(argv, RunOptions::default(), |argv, ctx| {
        cli_tool::run::<Documented, _, _, _>(argv.iter().copied(), ctx, handle_documented)
    })
}

#[test]
fn help_json_through_run_app_names_every_command() {
    let run = documented(&["docs", "help", "--json", "--depth", "all"]);
    assert_eq!((run.exit, run.err.as_str()), (0, ""));
    let doc: serde_json::Value = run.json().unwrap();
    assert_eq!(doc["schemaVersion"], 1);
    assert_eq!(doc["kind"], "help");
    assert_eq!(
        doc["tool"],
        serde_json::json!({ "name": "docs", "version": "0.4.0" })
    );
    let names: Vec<&str> = doc["help"]["commands"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["greet", "count", "help", "schema"]);
    let report: HelpReport = serde_json::from_value(doc).unwrap();
    assert_eq!(
        report.help.commands.unwrap()[2].summary,
        "Show help for a command, as text or JSON"
    );
}

#[test]
fn full_help_json_of_every_command_validates_against_the_help_schema() {
    let run = documented(&["docs", "help", "--json", "--full", "--depth", "all"]);
    assert_eq!((run.exit, run.err.as_str()), (0, ""));
    let doc: serde_json::Value = run.json().unwrap();
    let commands = doc["help"]["commands"].as_array().unwrap();
    let greet = &commands[0];
    assert_eq!(greet["examples"], serde_json::json!(["docs greet ada"]));
    assert!(greet["exits"].as_array().is_some_and(|e| !e.is_empty()));
    let count = &commands[1];
    assert!(
        count["description"]
            .as_str()
            .is_some_and(|d| d.contains("quote a phrase")),
        "{count:#}"
    );
    let style = count["flags"]
        .as_array()
        .unwrap()
        .iter()
        .find(|flag| flag["name"] == "style")
        .unwrap();
    assert_eq!(style["default"], "plain");
    let schema = document_schema(&help_doc()).unwrap();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let problems: Vec<String> = validator
        .iter_errors(&doc)
        .map(|error| format!("{error} at {}", error.instance_path))
        .collect();
    assert!(problems.is_empty(), "{problems:#?}");
}

#[test]
fn help_text_and_the_words_of_one_command() {
    let run = documented(&["docs", "help", "greet", "--full"]);
    assert_eq!(run.exit, 0, "{}", run.err);
    assert!(
        run.out.starts_with("docs greet — Greet someone\n"),
        "{}",
        run.out
    );
    assert!(
        run.out.contains("examples:\n  docs greet ada\n"),
        "{}",
        run.out
    );

    let unknown = documented(&["docs", "help", "nope"]);
    assert_eq!(
        (unknown.exit, unknown.err.as_str()),
        (2, "docs: no command 'nope'\n")
    );
}

#[test]
fn schema_json_through_run_app_gives_each_commands_schemas() {
    let run = documented(&["docs", "schema", "--json"]);
    assert_eq!((run.exit, run.err.as_str()), (0, ""));
    let report: SchemaReport = {
        let doc: serde_json::Value = run.json().unwrap();
        assert_eq!(doc["kind"], "schema");
        serde_json::from_value(doc).unwrap()
    };
    let paths: Vec<String> = report.commands.iter().map(|c| c.path.join(" ")).collect();
    assert_eq!(paths, ["", "greet", "count", "help", "schema", "error"]);
    let greet = &report.commands[1];
    assert_eq!(
        (greet.kind.as_deref(), greet.read_only),
        (Some("greeting"), Some(true))
    );
    let input = greet.input.as_ref().unwrap();
    assert_eq!(input["properties"]["name"]["x-cli"]["positional"], 0);
    assert_eq!(input["properties"]["json"]["x-cli"]["flag"], "--json");
    assert!(report.commands[2].output.is_none());

    // The text form is the same document.
    assert_eq!(documented(&["docs", "schema"]).out, run.out);

    // The help command's own document validates against the schema it publishes.
    let help = documented(&["docs", "help", "--json"]);
    let help_schema = report.commands[3].output.as_ref().unwrap();
    let validator = jsonschema::validator_for(help_schema).unwrap();
    assert!(validator.is_valid(&help.json::<serde_json::Value>().unwrap()));
    let schema_schema = report.commands[4].output.as_ref().unwrap();
    let validator = jsonschema::validator_for(schema_schema).unwrap();
    assert!(validator.is_valid(&run.json::<serde_json::Value>().unwrap()));

    // A refused command line's error document validates against the `error` entry, which
    // `schema error` also prints alone.
    let error_schema = report.commands[5].output.as_ref().unwrap();
    let refused = documented(&["docs", "help", "--depth", "x", "--json"]);
    assert_eq!(refused.exit, 2);
    let validator = jsonschema::validator_for(error_schema).unwrap();
    assert!(validator.is_valid(&refused.json::<serde_json::Value>().unwrap()));
    let alone: SchemaReport = documented(&["docs", "schema", "error", "--json"])
        .json()
        .unwrap();
    assert_eq!(alone.commands, report.commands[5..]);
}

#[test]
fn a_depth_that_is_not_a_number_exits_2() {
    let run = documented(&["docs", "help", "--depth", "x"]);
    assert_eq!(run.exit, 2);
    assert_eq!(run.out, "");
    assert_eq!(run.err, "docs: --depth needs a number or \"all\"\n");

    let json = documented(&["docs", "help", "--depth", "x", "--json"]);
    let doc: ErrorDocument = json.json().unwrap();
    assert_eq!((doc.code.as_str(), doc.exit), ("usage", 2));
    assert_eq!(doc.message, "--depth needs a number or \"all\"");
}
