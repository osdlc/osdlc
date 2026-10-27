//! The value shapes the neighbour sweeps place side by side: `tests/neighbours.rs`
//! at the top level and `tests/neighbours_nested.rs` below it.

use yaml_splice::{Mapping, Value};

/// Values as they follow `key:` at the top level. A multi-line value carries
/// its own two-space indent; a nested sweep indents it further.
pub const VALUES: &[&str] = &[
    "1",
    "'q' # c",
    "\"d\"",
    "plain words # c",
    "[a, 'b'] # c",
    "{x: 1} # c",
    "\n  - a\n  - 'b' # c\n  - |\n    blk\n",
    "\n  k: v\n  k2: |\n    z\n\n",
    "|\n  l1\n\n  l2\n",
    "|-\n  stripped\n",
    ">+\n  f\n\n",
    "",
    "'multi\n  line'",
    "\"esc \\\" q\" #c",
    "!!str 7",
    "|2\n   indented\n",
    "null # c",
    "\n  # only comment\n  a: 1\n",
    "|",
    "| # c\n  x\n",
    "|\n    x\n  # note",
    ">-\n    deep\n # one space\n",
    "\n    - a\n  # less\n    - b\n",
    "!!str | # c",
    "&x >-\n  y\n",
];

/// Values a `Set` writes: plain, and ones that render as block scalars
/// (`|`, `|-`, `|+` with trailing blank lines) and block collections.
pub fn new_values() -> Vec<Value> {
    let mut map = Mapping::new();
    map.insert("k", Value::from("two\nlines"));
    vec![
        Value::from("Z"),
        Value::from("line1\nline2\n"),
        Value::from("no final break\nend"),
        Value::from("kept\n\n\n"),
        Value::Seq(vec![Value::from("a\n\n"), Value::Int(1)]),
        Value::Map(map),
        Value::Float(1.5),
    ]
}

pub const SEPARATORS: &[&str] = &["", "# between\n", "\n"];
