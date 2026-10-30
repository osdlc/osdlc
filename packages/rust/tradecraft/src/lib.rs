//! `tradecraft` is now `skillwright`. This crate only holds the notice that
//! the `tradecraft` binary prints.

/// The message the `tradecraft` binary prints before it exits with status 1.
pub const NOTICE: &str = "tradecraft is now skillwright. Install it with one of:\n\
  cargo install skillwright\n\
  brew install osdlc/tap/skillwright\n\
  npm i -g @osdlc/skillwright\n\
Then run `skillwright` instead: https://crates.io/crates/skillwright";
