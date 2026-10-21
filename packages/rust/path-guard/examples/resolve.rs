//! Resolve client-supplied relative paths under a root, rejecting escapes.
//!
//! Run with `cargo run --example resolve`.

use std::path::Path;

use path_guard::Guard;

fn main() {
    let guard = Guard::std();
    let root = Path::new("/srv/data");
    for raw in ["notes/a.md", "../etc/passwd", "~/secret", "C:\\Windows"] {
        match guard.resolve(root, raw) {
            Ok(path) => println!("{raw:?} -> {}", path.display()),
            Err(err) => println!("{raw:?} rejected: {err}"),
        }
    }
}
