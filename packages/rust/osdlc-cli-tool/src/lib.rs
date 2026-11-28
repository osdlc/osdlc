#![doc = include_str!("../README.md")]
#![forbid(unsafe_code)]

mod builtins;
mod cli;
mod document;
mod exit;
mod failure;
mod help;
mod io;
mod main_shim;
mod safe;
mod schema;
pub mod testing;

pub use builtins::{
    HELP_WIDTH, HelpArgs, HelpReport, SchemaArgs, SchemaReport, ToolInfo, help_doc, help_report,
    schema_doc, schema_report,
};
pub use cli::{CommandError, DynReport, GlobalArgs, HasGlobals, Outcome, Report, run};
pub use document::{ErrorDocument, SCHEMA_VERSION, envelope_json};
pub use exit::{
    DOMAIN_EXIT_MAX, DOMAIN_EXIT_MIN, EXIT_MISSING_TOOL, EXIT_REPOSITORY, EXIT_SERVICE,
    EXIT_UNREACHABLE, Exit, is_domain_exit,
};
pub use failure::{Failure, FailureClass, render_error};
pub use help::{
    FlagKind, HelpDepth, HelpEntry, HelpExit, HelpFlag, HelpPositional, UNIVERSAL_EXITS,
    help_entry, render_help,
};
pub use io::{CapturedIo, Context, Io};
pub use main_shim::{exit_code, run_main, settle};
pub use safe::{safe, safe_line};
pub use schema::{
    CommandDoc, CommandDocs, ERROR_ENTRY, SCHEMA_DIALECT, SchemaEntry, document_schema,
    error_schema, input_schema, payload_schema, schema_entries,
};
