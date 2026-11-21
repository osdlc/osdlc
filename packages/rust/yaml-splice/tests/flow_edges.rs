//! Flow edits at the edges: a `#` inside a value, a comment after an element,
//! node properties, a document that is itself a flow collection.

use yaml_splice::{FieldEdit, PathSegment, Value, edit_yaml};

fn run(src: &str, edit: FieldEdit) -> Result<String, String> {
    edit_yaml(src.as_bytes(), &[edit])
        .map(|o| String::from_utf8(o.bytes).unwrap())
        .map_err(|e| e.to_string())
}

fn remove(path: &[PathSegment]) -> FieldEdit {
    FieldEdit::RemovePath {
        path: path.to_vec(),
    }
}

fn set(path: &[PathSegment], value: Value) -> FieldEdit {
    FieldEdit::SetPath {
        path: path.to_vec(),
        value,
    }
}

fn k(s: &str) -> PathSegment {
    PathSegment::from(s)
}

#[test]
fn a_hash_inside_a_value_is_not_a_comment() {
    assert_eq!(
        run("t: [a, \"x#y\"]\n", remove(&[k("t"), 1.into()])).unwrap(),
        "t: [a]\n"
    );
    assert_eq!(
        run("t: [\"x#y\", a]\n", remove(&[k("t"), 0.into()])).unwrap(),
        "t: [a]\n"
    );
    assert_eq!(
        run("t: {u: http://h/p#f, b: 1}\n", remove(&[k("t"), k("u")])).unwrap(),
        "t: {b: 1}\n"
    );
}

#[test]
fn an_append_never_moves_a_comment_to_the_new_element() {
    for src in [
        "t: [\n  a,\n  b # note\n]\n",
        "t: [\n  a,\n  b, # note\n]\n",
    ] {
        let err = run(src, set(&[k("t"), 2.into()], Value::from("c"))).unwrap_err();
        assert!(err.contains("a comment after the last element"), "{err}");
    }
}

#[test]
fn an_anchored_collection_loses_its_last_element() {
    assert_eq!(
        run("t: &x {k: 1}\n", remove(&[k("t"), k("k")])).unwrap(),
        "t: &x {}\n"
    );
}

#[test]
fn a_comment_inside_a_removed_or_emptied_element_is_never_lost() {
    for (src, edit) in [
        ("t: [{a: 1, # keep\n  b: 2}]\n", remove(&[k("t"), 0.into()])),
        ("t: {a: # keep\n  1, b: 2}\n", remove(&[k("t"), k("a")])),
        (
            "t: [{ # keep\n }]\n",
            set(&[k("t"), 0.into(), k("x")], Value::Int(1)),
        ),
    ] {
        let err = run(src, edit).unwrap_err();
        assert!(
            err.contains("a comment inside the flow collection"),
            "{src:?}: {err}"
        );
    }
}

#[test]
fn a_comment_trailing_a_removed_element_is_refused() {
    for (src, path) in [
        (
            "t: [\n  a,\n  b, # about b\n  c\n]\n",
            vec![k("t"), 1.into()],
        ),
        (
            "t: {\n  a: 1,\n  b: 2, # about b\n  c: 3\n}\n",
            vec![k("t"), k("b")],
        ),
        ("t: [\n  a,\n  b # about b\n]\n", vec![k("t"), 1.into()]),
    ] {
        let err = run(src, remove(&path)).unwrap_err();
        assert!(err.contains("comment"), "{src:?}: {err}");
    }
}

#[test]
fn a_removed_complex_key_leaves_the_next_keys_marker() {
    assert_eq!(
        run("t: {? a : 1, b: 2}\n", remove(&[k("t"), k("a")])).unwrap(),
        "t: {? b: 2}\n"
    );
}
