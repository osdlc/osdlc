//! `tradecraft` is now `skillwright`. This binary only says so.

fn main() {
    eprintln!(
        "tradecraft is now skillwright. Install it with `cargo install skillwright` \
         and run `skillwright` instead: https://crates.io/crates/skillwright"
    );
    std::process::exit(1);
}
