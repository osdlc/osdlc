//! Keep the tokens in a directory so share links survive a restart, rotate
//! one, and let an environment variable pin the full token.
//!
//! Run with `cargo run --example tokens_on_disk`.

use web_access::token::{self, Token};

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = std::env::temp_dir().join(format!("web-access-example-{}", std::process::id()));

    // The first call mints and writes the token; later calls read it back.
    let full = token::load_or_mint(&dir)?;
    assert_eq!(token::load_or_mint(&dir)?, full);
    assert!(token::token_path(&dir).exists());

    // A view-only token lives in its own file.
    let read = token::load_or_mint_read(&dir)?;
    assert_ne!(read, full);

    // Rotating the full token invalidates its old links; the read token stays.
    let rotated = token::rotate(&dir)?;
    assert_ne!(rotated, full);
    assert_eq!(token::load_or_mint_read(&dir)?, read);

    // An override (for example from an environment variable) wins and is not
    // written anywhere. An unset or empty one is ignored. Read a real one with
    // `token::override_from_env("APP_TOKEN")`.
    let pinned = Token::mint()?;
    let set = token::parse_override("APP_TOKEN", Some(pinned.as_str()))?;
    assert_eq!(token::resolve(&dir, set)?, pinned);
    assert_eq!(
        token::resolve(&dir, token::parse_override("APP_TOKEN", None)?)?,
        rotated
    );

    // Anything but a token is refused, and the error never shows the text.
    let err = token::parse_override("APP_TOKEN", Some("hunter2")).unwrap_err();
    assert!(err.to_string().contains("APP_TOKEN") && !err.to_string().contains("hunter2"));

    println!("full token: {} characters", rotated.as_str().len());
    println!("read token: {} characters", read.as_str().len());

    std::fs::remove_dir_all(&dir)?;
    Ok(())
}
