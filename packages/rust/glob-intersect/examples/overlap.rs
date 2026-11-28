//! Ask whether two globs can match a common path, and see one that does.
//!
//! Run with `cargo run --example overlap`.

use glob_intersect::{Options, witness};

fn main() -> Result<(), glob_intersect::Error> {
    let o = Options::default();
    for (a, b) in [
        ("src/**/*.ts", "src/api/handler.ts"),
        ("src/api/**", "src/web/**"),
        ("src/api/**", "src/**/handler.ts"),
    ] {
        match witness(&[a], &[b], o)? {
            Some(path) => println!("{a} and {b} share {path}"),
            None => println!("{a} and {b} share no path"),
        }
    }
    Ok(())
}
