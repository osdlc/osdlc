//! Keep the tokens in a directory so share links survive a restart, rotate
//! one, and let an environment variable pin the full token.
//!
//! Run with `cargo run --example tokens_on_disk`.

use web_access::token;

/// Runs the example; `tests/examples.rs` runs it too.
pub fn main() -> std::io::Result<()> {
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
    // written anywhere. A blank one is ignored.
    assert_eq!(
        token::resolve(&dir, Some("pinned-by-env"))?,
        "pinned-by-env"
    );
    assert_eq!(token::resolve(&dir, Some("  "))?, rotated);

    println!("full token: {} characters", rotated.len());
    println!("read token: {} characters", read.len());

    std::fs::remove_dir_all(&dir)?;
    Ok(())
}
