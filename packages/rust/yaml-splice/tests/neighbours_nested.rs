//! A nested edit never changes a key it does not address.
//!
//! `tests/neighbours.rs` one level down. The same value shapes are placed as
//! three children of a parent, in two layouts:
//!
//! - a block mapping: `parent:` with children at two spaces;
//! - a compact mapping item of a block sequence: `parent:` then `- first:`,
//!   whose first key sits at column 4 while its line is indented 2.
//!
//! A top-level key follows the parent, so an edit that runs past its parent's
//! end shows up as a changed neighbour too. Each child gets a `RemovePath` and
//! a `SetPath` of every value in `new_values()`. The result must parse to the
//! original document with only that child changed, or be an `InvalidResult`
//! refusal. It is never a silently different document.
//!
//! The run is gated by [`ENABLED`] until tier 1 is implemented; until then
//! the test checks only the documents it generates. The refusal causes are
//! pinned when the run is enabled, the way `tests/neighbours.rs` pins them.

mod shapes;

use shapes::{SEPARATORS, VALUES, new_values};
use yaml_splice::{Mapping, Value, parse::parse};

/// Whether the edits run. Turned on with tier 1.
const ENABLED: bool = false;

#[derive(Debug, Clone, Copy)]
enum Layout {
    /// `parent:` / `  first: …`
    Map,
    /// `parent:` / `  - first: …` / `    second: …`
    SeqItem,
}

impl Layout {
    /// The column of the children's keys.
    fn indent(self) -> &'static str {
        match self {
            Layout::Map => "  ",
            Layout::SeqItem => "    ",
        }
    }

    fn first_line_prefix(self) -> &'static str {
        match self {
            Layout::Map => "  ",
            Layout::SeqItem => "  - ",
        }
    }
}

/// `value` moved from the top level to `indent`: every line after the first
/// that has content gains the indent. Blank lines stay blank, since spaces on
/// them could become content of a keep-chomped block.
fn indented(value: &str, indent: &str) -> String {
    let mut lines = value.split('\n');
    let mut out = lines.next().unwrap_or_default().to_string();
    for line in lines {
        out.push('\n');
        if !line.is_empty() {
            out.push_str(indent);
            out.push_str(line);
        }
    }
    out
}

fn document(layout: Layout, a: &str, b: &str, sep: &str) -> String {
    let ind = layout.indent();
    let sep = indented(sep, ind);
    let sep = if sep.is_empty() || sep == "\n" {
        sep
    } else {
        format!("{ind}{sep}")
    };
    format!(
        "parent:\n{}first: {}\n{sep}{ind}second: {}\n{ind}last: end # t\ntail: 1\n",
        layout.first_line_prefix(),
        indented(a, ind),
        indented(b, ind),
    )
}

/// The children of `parent` in `root`, wherever the layout puts them.
fn children(root: &Value, layout: Layout) -> Option<&Mapping> {
    let parent = root.as_mapping()?.get("parent")?;
    match layout {
        Layout::Map => parent.as_mapping(),
        Layout::SeqItem => parent.as_seq()?.first()?.as_mapping(),
    }
}

/// `root` with the children of `parent` replaced by `kids`.
fn with_children(root: &Value, layout: Layout, kids: Mapping) -> Value {
    let mut top = root.as_mapping().expect("a mapping root").clone();
    let parent = match layout {
        Layout::Map => Value::Map(kids),
        Layout::SeqItem => Value::Seq(vec![Value::Map(kids)]),
    };
    top.insert("parent", parent);
    Value::Map(top)
}

#[test]
fn a_nested_edit_changes_only_the_key_it_addresses() {
    let mut documents = 0;
    let mut planned = 0;
    for layout in [Layout::Map, Layout::SeqItem] {
        for eol in ["\n", "\r\n"] {
            for a in VALUES {
                for b in VALUES {
                    for sep in SEPARATORS {
                        let src = document(layout, a, b, sep).replace('\n', eol);
                        let Ok(original) = parse(&src) else {
                            continue;
                        };
                        let kids = children(&original, layout)
                            .unwrap_or_else(|| panic!("no children in {src:?}"));
                        assert_eq!(
                            kids.keys().collect::<Vec<_>>(),
                            ["first", "second", "last"],
                            "{src:?}"
                        );
                        documents += 1;
                        for key in ["first", "second", "last"] {
                            let mut removed = kids.clone();
                            removed.remove(key);
                            let mut wants = vec![with_children(&original, layout, removed)];
                            for value in new_values() {
                                let mut set = kids.clone();
                                set.insert(key, value);
                                wants.push(with_children(&original, layout, set));
                            }
                            planned += wants.len();
                            if ENABLED {
                                unimplemented!("tier 1 runs the edits here");
                            }
                        }
                    }
                }
            }
        }
    }
    // Every shape pair parses in both layouts, as it does at the top level.
    assert_eq!(documents, 7_500, "documents generated");
    assert_eq!(planned, 180_000, "edits planned");
}

#[test]
fn a_shape_reads_the_same_one_level_down() {
    // The indenting is what the sweep relies on: each shape must mean at depth
    // what it means at the top level.
    for layout in [Layout::Map, Layout::SeqItem] {
        for v in VALUES {
            let top = parse(&format!("first: {v}\nlast: end\n")).unwrap();
            let nested = parse(&document(layout, v, "1", "")).unwrap();
            assert_eq!(
                children(&nested, layout).and_then(|m| m.get("first")),
                top.as_mapping().and_then(|m| m.get("first")),
                "{v:?} in {layout:?}"
            );
        }
    }
}
