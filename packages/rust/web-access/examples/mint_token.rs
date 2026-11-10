//! Print a new token, for an override such as an environment variable or to
//! put in a token file by hand.
//!
//! Run with `cargo run -p web-access --example mint_token`.

use web_access::token::Token;

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() -> std::io::Result<()> {
    println!("{}", Token::mint()?);
    Ok(())
}
