//! An edit never changes a key it does not address.
//!
//! Builds three-key documents from many value shapes (quoted, plain, flow,
//! block collections, block scalars with every chomping indicator, comments
//! and blank lines between keys, comments indented less than a block's
//! content), in LF and CRLF, and runs a `Remove` and several `Set`s on each
//! key. The new values include ones that render as block scalars, `|+` with
//! trailing blank lines among them. The result either parses to the original
//! mapping with only that key changed, or is an `InvalidResult` refusal. It
//! is never a silently different document.
//!
//! Every refusal must have a known cause, found by running the same edit
//! through the unchecked `splice` functions and comparing what they produce.
//! The count for each cause is pinned, so a new cause, or a shape that starts
//! failing, is a test failure. See [`Cause`] for the causes.

use std::collections::BTreeMap;

use yaml_splice::{
    EditError, FieldEdit, Mapping, Value, edit_yaml,
    parse::parse_mapping,
    splice::{remove_key, splice_key},
};

const VALUES: &[&str] = &[
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
fn new_values() -> Vec<Value> {
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

const SEPARATORS: &[&str] = &["", "# between\n", "\n"];

#[test]
fn an_edit_changes_only_the_key_it_addresses() {
    let mut checked = 0;
    let mut failures = Vec::new();
    let mut refused: BTreeMap<Cause, usize> = BTreeMap::new();
    for eol in ["\n", "\r\n"] {
        for a in VALUES {
            for b in VALUES {
                for sep in SEPARATORS {
                    let src =
                        format!("first: {a}\n{sep}second: {b}\nlast: end # t\n").replace('\n', eol);
                    let Ok(original) = parse_mapping(&src) else {
                        continue;
                    };
                    for key in ["first", "second", "last"] {
                        let mut removed = original.clone();
                        removed.remove(key);
                        let mut cases = vec![(FieldEdit::Remove { key: key.into() }, removed)];
                        for value in new_values() {
                            let mut set = original.clone();
                            set.insert(key, value.clone());
                            cases.push((
                                FieldEdit::Set {
                                    key: key.into(),
                                    value,
                                },
                                set,
                            ));
                        }
                        for (edit, want) in cases {
                            checked += 1;
                            match edit_yaml(src.as_bytes(), std::slice::from_ref(&edit)) {
                                Ok(out) => {
                                    let text = String::from_utf8(out.bytes).unwrap();
                                    if parse_mapping(&text).ok().as_ref() != Some(&want) {
                                        failures.push(format!("{edit:?} on {src:?} gave {text:?}"));
                                    }
                                }
                                Err(EditError::InvalidResult { .. }) => {
                                    match cause(&src, &edit, &original, &want) {
                                        Some(c) => *refused.entry(c).or_insert(0) += 1,
                                        None => failures.push(format!(
                                            "{edit:?} on {src:?} was refused for no known cause"
                                        )),
                                    }
                                }
                                Err(e) => failures.push(format!("{edit:?} on {src:?}: {e}")),
                            }
                        }
                    }
                }
            }
        }
    }
    assert_eq!(checked, 90_000, "the number of edits run");
    assert!(
        failures.is_empty(),
        "{} of {checked} edits went wrong:\n{}",
        failures.len(),
        failures.join("\n")
    );
    let expected = BTreeMap::from([
        (Cause::NewKeepValueGainsBlankLines, 3650),
        (Cause::CommentLandsInNewBlock, 900),
        (Cause::KeepNeighbourGainsBlankLines, 40),
        (Cause::KeptCommentJoinsPreviousBlock, 40),
        (Cause::TrailingEmptyBlockReadsAsLineBreak, 300),
    ]);
    // Pinned exactly: a change in any count means a shape changed behaviour.
    assert_eq!(refused, expected, "refusals by cause, of {checked} edits");
}

/// Why an edit is refused: the shapes the README's "What is refused" lists.
/// Each refusal is a choice, not a limit of YAML: another layout (an explicit
/// indentation indicator such as `|4`, or moving the comment) could make some
/// of these edits safe. The refusal is the simple, safe answer for now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Cause {
    /// A `Set` writes a keep-chomped (`|+`) value, and a blank line follows
    /// it in the document. The blank line would join the new value.
    NewKeepValueGainsBlankLines,
    /// A `Set` writes a block value where the old block value had a comment
    /// indented less than its content. The comment lands at the new block's
    /// indent and becomes content.
    CommentLandsInNewBlock,
    /// A neighbour is keep-chomped (`|+`), and the edit moves a blank line up
    /// against it (removing the next key, or a block value whose trailing
    /// blank lines stay). The neighbour would gain the blank line.
    KeepNeighbourGainsBlankLines,
    /// A `Remove` keeps a comment that was indented less than the removed
    /// block value's content, and that comment now follows the previous key's
    /// block scalar at or past its indent, so it would become that value's
    /// content.
    KeptCommentJoinsPreviousBlock,
    /// After a `Remove`, an empty block scalar (`a: |`) is the last line of
    /// the document; `saphyr-parser` then reads it as a line break, not as an
    /// empty string.
    TrailingEmptyBlockReadsAsLineBreak,
}

/// The cause of a refusal, from what the unchecked splice of the same edit
/// produces. `None` when it fits no known cause.
fn cause(src: &str, edit: &FieldEdit, original: &Mapping, want: &Mapping) -> Option<Cause> {
    let out = match edit {
        FieldEdit::Set { key, value } => splice_key(src, key, value.clone()),
        FieldEdit::Remove { key } => remove_key(src, key),
        _ => return None,
    }
    .ok()?;
    let got = parse_mapping(&out).ok()?;
    let keys: Vec<&str> = want.iter().map(|(k, _)| k).collect();
    if got.iter().map(|(k, _)| k).collect::<Vec<_>>() != keys {
        return None;
    }
    let mut causes = Vec::new();
    for (k, w) in want.iter() {
        let g = got.get(k)?;
        if g == w {
            continue;
        }
        let addressed = matches!(edit, FieldEdit::Set { key, .. } if key == k);
        let c = if addressed && gains_line_breaks(g, w) {
            Cause::NewKeepValueGainsBlankLines
        } else if addressed && gains_comment(g, w, src) {
            Cause::CommentLandsInNewBlock
        } else if !addressed && matches!(edit, FieldEdit::Remove { .. }) && gains_comment(g, w, src)
        {
            Cause::KeptCommentJoinsPreviousBlock
        } else if !addressed && w == &Value::from("") && g == &Value::from("\n") {
            Cause::TrailingEmptyBlockReadsAsLineBreak
        } else if !addressed && gains_line_breaks(g, w) && original.get(k) == Some(w) {
            Cause::KeepNeighbourGainsBlankLines
        } else {
            return None;
        };
        causes.push(c);
    }
    match causes.as_slice() {
        [c] => Some(*c),
        _ => None,
    }
}

/// `got` is `want` with extra line breaks at the end of one or more strings.
fn gains_line_breaks(got: &Value, want: &Value) -> bool {
    match (got, want) {
        (Value::Str(g), Value::Str(w)) => {
            g.len() > w.len()
                && w.ends_with('\n')
                && g.starts_with(w.as_str())
                && g[w.len()..].chars().all(|c| c == '\n')
        }
        (Value::Seq(g), Value::Seq(w)) => {
            g.len() == w.len()
                && g.iter()
                    .zip(w)
                    .all(|(g, w)| g == w || gains_line_breaks(g, w))
        }
        _ => false,
    }
}

/// `got` is `want` with one line added to a string (line breaks at the end
/// aside), and that line is a comment line of `src` indented less than the
/// line before it (an old block value's content).
fn gains_comment(got: &Value, want: &Value, src: &str) -> bool {
    match (got, want) {
        (Value::Str(g), Value::Str(w)) => {
            let lines: Vec<&str> = src.lines().map(|l| l.trim_end_matches('\r')).collect();
            let indent = |l: &str| l.len() - l.trim_start().len();
            let comments: Vec<&str> = lines
                .windows(2)
                .filter(|p| p[1].trim_start().starts_with('#') && indent(p[1]) < indent(p[0]))
                .map(|p| p[1].trim())
                .collect();
            let g_lines: Vec<&str> = g.split('\n').collect();
            (0..g_lines.len()).any(|i| {
                comments.contains(&g_lines[i].trim()) && {
                    // The line breaks around the comment can change with it
                    // (a blank run before it becomes content, and a folded
                    // block folds them), so only those are let differ.
                    let mut rest = g_lines.clone();
                    rest.remove(i);
                    rest.join("\n").trim_end_matches('\n') == w.trim_end_matches('\n')
                }
            })
        }
        (Value::Map(g), Value::Map(w)) => {
            g.len() == w.len()
                && g.iter().zip(w.iter()).all(|((gk, gv), (wk, wv))| {
                    gk == wk && (gv == wv || gains_comment(gv, wv, src))
                })
        }
        _ => false,
    }
}
