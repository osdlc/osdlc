//! The corpus runner: glob-routed validation over a document set. The core takes
//! strings; the `native` feature adds a thin `std::fs` layer.
//!
//! This file is a barrel only: it re-exports, it holds no logic.

mod corpus;
#[cfg(feature = "native")]
mod native;

pub use corpus::{
    CorpusConfig, CorpusRule, GlobError, RunOptions, RunOutcome, RunStats, run_corpus,
};
#[cfg(feature = "native")]
pub use native::{NativeRunError, run_corpus_dir, walk_dir};
