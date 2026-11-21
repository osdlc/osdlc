//! A flow edit never changes an element it does not address.
//!
//! The flow-collection counterpart of `tests/neighbours_nested.rs`. Three
//! elements of a flow mapping or a flow sequence take a set of value shapes,
//! in each layout (one line, spaced, one element per line, with a trailing
//! comma), in LF and CRLF. Each element gets a `RemovePath` and a `SetPath` of every value in
//! `NEW`. The result must parse to the original document with only that
//! element changed, or the edit is refused. The refusals are counted: a
//! comment or shape that is not edited (`UnsupportedPath`), and a result the
//! parser cannot read back (`InvalidResult`).

use yaml_splice::{EditError, FieldEdit, Mapping, PathSegment, Value, edit_yaml, parse::parse};

/// How an element's value is written in the source.
const VALUES: &[&str] = &[
    "1",
    "plain words",
    "'q, with comma'",
    "\"d: colon\"",
    "'#'",
    "[a, 'b']",
    "{x: 1, y: [2]}",
    "[]",
    "{}",
    "null",
    "'multi\n    line'",
];

fn new_values() -> Vec<Value> {
    let mut map = Mapping::new();
    map.insert("k", Value::from("a, b"));
    vec![
        Value::from("Z"),
        Value::from("x, y"),
        Value::from("l1\nl2\n"),
        Value::Int(7),
        Value::Seq(vec![Value::from("a]"), Value::Int(1)]),
        Value::Map(map),
        Value::Seq(vec![]),
        Value::Null,
    ]
}

#[derive(Clone, Copy, Debug)]
enum Layout {
    Line,
    Spaced,
    Lines,
    TrailingComma,
}

fn wrap(open: &str, close: &str, items: &[String], layout: Layout) -> String {
    match layout {
        Layout::Line => format!("{open}{}{close}", items.join(", ")),
        Layout::Spaced => format!("{open} {} {close}", items.join(", ")),
        Layout::Lines => format!("{open}\n  {}\n{close}", items.join(",\n  ")),
        Layout::TrailingComma => format!("{open}{},{close}", items.join(", ")),
    }
}

#[test]
fn a_flow_edit_changes_only_the_element_it_addresses() {
    let mut checked = 0;
    let mut refused = 0;
    let mut invalid: Vec<String> = Vec::new();
    let mut failures = Vec::new();
    for layout in [
        Layout::Line,
        Layout::Spaced,
        Layout::Lines,
        Layout::TrailingComma,
    ] {
        for eol in ["\n", "\r\n"] {
            for a in VALUES {
                for b in VALUES {
                    for as_map in [true, false] {
                        let src = if as_map {
                            let items = [
                                format!("first: {a}"),
                                format!("second: {b}"),
                                "last: end".to_string(),
                            ];
                            format!("top: {}\ntail: 1\n", wrap("{", "}", &items, layout))
                        } else {
                            let items = [a.to_string(), b.to_string(), "end".to_string()];
                            format!("top: {}\ntail: 1\n", wrap("[", "]", &items, layout))
                        }
                        .replace('\n', eol);
                        let Ok(original) = parse(&src) else { continue };
                        let top = original.as_mapping().unwrap().get("top").unwrap().clone();
                        for pos in 0..3 {
                            let seg: PathSegment = if as_map {
                                ["first", "second", "last"][pos].into()
                            } else {
                                pos.into()
                            };
                            let path = vec![PathSegment::from("top"), seg.clone()];
                            let with = |f: &dyn Fn(&mut Value)| {
                                let mut doc = original.clone();
                                let mut t = top.clone();
                                f(&mut t);
                                doc.as_mapping_mut().unwrap().insert("top", t);
                                doc
                            };
                            let set_at = |t: &mut Value, v: Value| match (t, &seg) {
                                (Value::Map(m), PathSegment::Key(k)) => {
                                    m.insert(k.clone(), v);
                                }
                                (Value::Seq(s), PathSegment::Index(i)) => s[*i] = v,
                                _ => unreachable!(),
                            };
                            let mut cases = vec![(
                                FieldEdit::RemovePath { path: path.clone() },
                                with(&|t| match (t, &seg) {
                                    (Value::Map(m), PathSegment::Key(k)) => {
                                        m.remove(k);
                                    }
                                    (Value::Seq(s), PathSegment::Index(i)) => {
                                        s.remove(*i);
                                    }
                                    _ => unreachable!(),
                                }),
                            )];
                            for v in new_values() {
                                cases.push((
                                    FieldEdit::SetPath {
                                        path: path.clone(),
                                        value: v.clone(),
                                    },
                                    with(&|t| set_at(t, v.clone())),
                                ));
                            }
                            for (edit, want) in cases {
                                checked += 1;
                                match edit_yaml(src.as_bytes(), std::slice::from_ref(&edit)) {
                                    Ok(out) => {
                                        let text = String::from_utf8(out.bytes).unwrap();
                                        if parse(&text).ok().as_ref() != Some(&want) {
                                            failures.push(format!("{edit:?} on {src:?}: {text:?}"));
                                        }
                                    }
                                    Err(EditError::InvalidResult { .. }) => {
                                        invalid.push(format!("{edit:?} on {src:?}"));
                                    }
                                    Err(EditError::UnsupportedPath { .. }) => refused += 1,
                                    Err(e) => failures.push(format!("{edit:?} on {src:?}: {e}")),
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {checked} edits went wrong:\n{}",
        failures.len(),
        failures
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    // Pinned. Every refusal is the one-element-per-line layout, with the
    // closing bracket at column 0, after an edit that leaves a quoted scalar
    // or a flow collection as the last element: `saphyr-parser` rejects that
    // shape (`['a',\n'x'\n]`), so the result check refuses it. The same
    // document with a plain last element reads fine.
    assert_eq!(invalid.len(), 288, "refused as InvalidResult: {invalid:#?}");
    assert!(
        invalid
            .iter()
            .all(|i| i.contains(r"\n]") || i.contains(r"\n}")),
        "refusals outside the closing-bracket layout"
    );
    eprintln!("flow sweep: {checked} edits, {refused} refused for a comment or shape");
}
