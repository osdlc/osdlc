//! Resolve link targets against a set of file paths.

use markdown_link::LinkIndex;

fn main() {
    let paths: Vec<String> = [
        "notes/plan.md",
        "archive/plan.md",
        "notes/daily/2026-10-18.md",
        "notes/topics/glutes.md",
        "img/diagram.png",
    ]
    .map(String::from)
    .to_vec();
    let index = LinkIndex::build(&paths);

    let cases = [
        ("plan", "notes/daily/2026-10-18.md"), // ambiguous: shortest path wins
        ("notes/plan", "other.md"),            // a path suffix
        ("../plan", "notes/daily/2026-10-18.md"), // relative to the linking note
        ("muscle-groups/glutes", "other.md"),  // a pathed miss falls back to its basename
        ("diagram.png", "other.md"),           // attachments resolve by name too
        ("missing", "other.md"),
    ];
    for (target, from) in cases {
        println!(
            "{target:22} from {from:28} -> {:?}",
            index.resolve_from(target, from)
        );
    }
    println!("{} keys, {} collisions", index.len(), index.collisions);
}
