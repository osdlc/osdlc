//! A small app: one handler serves text and `--json`.
//!
//! Run with `cargo run -p osdlc-cli-tool --example greeter -- greet ada --json`.

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
            Box::new(Greeting {
                greeting: format!("{who}, {name}!"),
            })
        }
        Cmd::Count { words } => Box::new(Count { count: words.len() }),
        Cmd::Find { .. } => return Ok(Found { matches: vec![] }.with_exit(1)),
    };
    Ok(report.into())
}

fn main() -> ExitCode {
    cli_tool::run_main(|ctx| cli_tool::run::<Cli, _, _, _>(std::env::args_os(), ctx, handle))
}
