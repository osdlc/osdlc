//! Check two claims of paths for overlap, and print the path they share.
//!
//! Run with `cargo run -p glob-intersect --example overlap`.

use glob_intersect::{Error, Options, intersects, witness};

fn main() -> Result<(), Error> {
    let o = Options::default();
    let pairs: [(&[&str], &[&str]); 3] = [
        (&["src/api/**"], &["src/**/handler.ts"]),
        (&["src/api/**"], &["src/web/**"]),
        (&["docs/*.md", "README.md"], &["**/README.md"]),
    ];
    for (a, b) in pairs {
        if intersects(a, b, o)? {
            let at = witness(a, b, o)?.unwrap_or_default();
            println!("{a:?} and {b:?} overlap, for example at {at}");
        } else {
            println!("{a:?} and {b:?} are disjoint");
        }
    }
    Ok(())
}
