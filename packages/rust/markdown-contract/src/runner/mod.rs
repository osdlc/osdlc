//! The corpus runner: glob-routed validation over a document set, fs-free at
//! the core with a thin std::fs layer behind the `native` feature.
//!
//! This file is a barrel only: it re-exports, it holds no logic.

pub mod corpus;
#[cfg(feature = "native")]
pub mod native;

pub use corpus::{
    CorpusConfig, CorpusRule, GlobError, RunOptions, RunOutcome, RunStats, compile_matcher,
    run_corpus,
};
#[cfg(feature = "native")]
pub use native::{NativeRunError, run_corpus_dir, walk_dir};
