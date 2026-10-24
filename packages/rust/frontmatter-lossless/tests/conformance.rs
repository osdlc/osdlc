//! Framing conformance corpus for `frontmatter-lossless`.
//!
//! The cases the framing must get right: BOM, CRLF, empty and unterminated
//! blocks, byte offsets, and round trips. Each fixture holds one case a simple
//! splitter gets wrong. Each property is checked against the whole corpus, so a
//! regression in one code path fails every fixture it affects.
//!
//! The corpus is plain JSON at `tests/fixtures/conformance.json`, and this
//! file loads it. The TypeScript version, `@osdlc/frontmatter-lossless`, tests
//! a copy of the same corpus, so the two implementations agree on every case. Each fixture is
//! `{ name, source, split, lenient }` where `split` is the strict
//! [`split`] outcome (`yaml` null when there is no block, plus the
//! `bom`/`openEol`/`closeEol` shape) and `lenient` is the [`split_lenient`]
//! outcome (`null` when it finds no block). The round trip,
//! `compose(split(src)) == src`, is checked for every fixture rather than
//! stored. A fixture may also carry `edit`
//! (`{ yaml, body, out }`): composing that new yaml and body with the source's
//! shape must give `out`, and `out` must split back to them.

use frontmatter_lossless::{compose, split, split_lenient};
use serde_json::Value as Json;

const CORPUS: &str = include_str!("fixtures/conformance.json");

fn fixtures() -> Vec<Json> {
    let root: Json = serde_json::from_str(CORPUS).expect("conformance.json is valid JSON");
    let fixtures = root.as_array().expect("conformance.json is a JSON array");
    assert!(!fixtures.is_empty(), "the corpus is empty");
    fixtures.clone()
}

fn str_of<'a>(fx: &'a Json, key: &str) -> &'a str {
    fx.get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("fixture field {key:?} must be a string: {fx}"))
}

/// The whole shared corpus, one test. A failure lists every failing fixture by
/// name rather than stopping at the first, so a change shows everything it
/// breaks.
#[test]
fn shared_conformance_corpus() {
    let mut failures = Vec::new();
    for fx in fixtures() {
        let name = fx.get("name").and_then(Json::as_str).unwrap_or("<unnamed>");
        if let Err(msg) = run_fixture(&fx) {
            failures.push(format!("  [{name}] {msg}"));
        }
    }
    assert!(
        failures.is_empty(),
        "conformance corpus failures:\n{}",
        failures.join("\n")
    );
}

fn run_fixture(fx: &Json) -> Result<(), String> {
    let source = str_of(fx, "source");
    let expect = fx.get("split").ok_or("fixture is missing \"split\"")?;

    // Strict split: yaml, body and shape all match the stored values.
    let s = split(source);
    let want_yaml = expect.get("yaml").ok_or("split.yaml is required")?;
    match (s.yaml, want_yaml.as_str()) {
        (Some(got), Some(want)) if got == want => {}
        (None, _) if want_yaml.is_null() => {}
        (got, _) => return Err(format!("split.yaml: got {got:?}, want {want_yaml}")),
    }
    if s.body != str_of(expect, "body") {
        return Err(format!(
            "split.body: got {:?}, want {:?}",
            s.body,
            str_of(expect, "body")
        ));
    }
    if s.shape.bom != expect.get("bom").and_then(Json::as_bool).unwrap_or(false) {
        return Err(format!("split.bom: got {}", s.shape.bom));
    }
    if s.shape.open_eol.as_str() != str_of(expect, "openEol") {
        return Err(format!("split.openEol: got {:?}", s.shape.open_eol));
    }
    if s.shape.close_eol.as_str() != str_of(expect, "closeEol") {
        return Err(format!("split.closeEol: got {:?}", s.shape.close_eol));
    }
    let want_sep = expect
        .get("closeSep")
        .and_then(Json::as_bool)
        .ok_or("split.closeSep is required")?;
    if s.shape.close_sep != want_sep {
        return Err(format!("split.closeSep: got {}", s.shape.close_sep));
    }

    // The property that matters: split a note and compose it again, and get
    // the original file byte for byte. Anything that normalises fences, drops
    // or doubles a BOM, or rewrites CRLF fails on every shape it affects.
    let out = compose(s.yaml, s.body, s.shape);
    if out != source {
        return Err(format!("round trip was not byte-identical: {out:?}"));
    }

    // Lenient split: the tolerant read-only split matches the stored values.
    let lenient = fx.get("lenient").ok_or("fixture is missing \"lenient\"")?;
    match (split_lenient(source), lenient.as_object()) {
        (None, None) if lenient.is_null() => {}
        (Some(ls), Some(_)) => {
            let (yaml, body) = (ls.yaml, ls.body);
            if yaml != str_of(lenient, "yaml") || body != str_of(lenient, "body") {
                return Err(format!(
                    "lenient: got ({yaml:?}, {body:?}), want ({:?}, {:?})",
                    str_of(lenient, "yaml"),
                    str_of(lenient, "body")
                ));
            }
        }
        (got, _) => return Err(format!("lenient: got {got:?}, want {lenient}")),
    }

    // Edit: new text composed into the source's shape lands where a later
    // split finds it again.
    if let Some(edit) = fx.get("edit") {
        let (yaml, body) = (str_of(edit, "yaml"), str_of(edit, "body"));
        let out = compose(Some(yaml), body, s.shape);
        if out != str_of(edit, "out") {
            return Err(format!("edit: got {out:?}, want {:?}", str_of(edit, "out")));
        }
        let back = split(&out);
        if back.yaml != Some(yaml) || back.body != body {
            return Err(format!(
                "edit: split back to ({:?}, {:?})",
                back.yaml, back.body
            ));
        }
    }
    Ok(())
}

/// `yaml_range` and `body_start` index the original source exactly, so an edit
/// can use real byte offsets. (Offsets are byte positions into the UTF-8
/// source. The TypeScript package uses UTF-16 string indices instead and checks
/// its own offsets against the source string.)
#[test]
fn offsets_index_the_original_source_across_the_corpus() {
    for fx in fixtures() {
        let name = fx.get("name").and_then(Json::as_str).unwrap_or("<unnamed>");
        let src = str_of(&fx, "source");
        let s = split(src);
        if let Some(yaml) = s.yaml {
            assert_eq!(&src[s.yaml_range.clone()], yaml, "{name}: yaml_range wrong");
        }
        assert_eq!(&src[s.body_start..], s.body, "{name}: body_start wrong");
    }
}

/// The empty block is a shape of its own: [`split`] returns it as `Some("")`
/// with its framing, and [`compose`] puts the fences back.
#[test]
fn compose_reproduces_an_empty_block() {
    let s = split("---\n---\nbody\n");
    assert_eq!(s.yaml, Some(""), "the empty block is captured");
    assert_eq!(s.body, "body\n");
    assert_eq!(&"---\n---\nbody\n"[s.yaml_range.clone()], "");
    assert_eq!(compose(s.yaml, s.body, s.shape), "---\n---\nbody\n");
}

#[test]
fn bom_is_recognised_and_preserved() {
    let s = split("\u{feff}---\ntitle: hi\n---\nbody\n");
    assert!(s.shape.bom, "BOM not recognised");
    assert_eq!(s.yaml, Some("title: hi"), "BOM must not leak into the yaml");
    assert_eq!(&split("---\ntitle: hi\n---\nbody\n").yaml, &s.yaml);
    // A BOM anywhere but byte zero is ordinary content, not framing.
    let mid = split("---\ntitle: a\u{feff}b\n---\nbody\n");
    assert!(!mid.shape.bom);
    assert_eq!(mid.yaml, Some("title: a\u{feff}b"));
}

#[test]
fn crlf_fences_survive_a_value_swap() {
    // Simulate an edit: keep the shape and pass `compose` new YAML text. The
    // fences must come back as CRLF, not LF.
    let s = split("---\r\ntitle: old\r\n---\r\nbody\r\n");
    let out = compose(Some("title: new\r"), s.body, s.shape);
    assert_eq!(out, "---\r\ntitle: new\r\n---\r\nbody\r\n");
    assert!(!out.contains("---\n"), "an LF fence leaked in: {out:?}");
}

#[test]
fn an_unterminated_or_empty_block_yields_body() {
    // Unterminated: the whole thing is body, no yaml.
    let unterminated = split("---\ntitle: hi\nstill going\n");
    assert_eq!(unterminated.yaml, None);
    assert_eq!(unterminated.body, "---\ntitle: hi\nstill going\n");

    // Empty file: no yaml, empty body, round-trips.
    let empty = split("");
    assert_eq!(empty.yaml, None);
    assert_eq!(empty.body, "");
    assert_eq!(compose(empty.yaml, empty.body, empty.shape), "");
}
