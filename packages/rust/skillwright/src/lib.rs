//! The Skillwright CLI: exit codes, project/machine configuration, per-run
//! vault/namespace resolution, report rendering, and the verbs themselves.
//!
//! [`cli::run`] is the seam the binary in `main.rs` and every test in this
//! crate drive; [`cli::run_with`] is the same entry with the
//! [`ctx::CommandContext`] supplied.

pub mod apply;
pub mod cli;
pub mod commands;
pub mod config;
pub mod ctx;
pub mod dirs;
pub mod exit;
pub mod git_source;
pub mod prompt;
pub mod report;
pub mod resolve;
