//! The generator's own gate: every wasm export is covered, and the file on
//! disk is what the current Rust source produces.
//!
//! These run against the real crates rather than fixtures. A fixture would be
//! a second copy of the boundary, and this crate exists because a second copy
//! of the boundary is what drifted in the first place.

use std::path::{Path, PathBuf};

/// The Cargo workspace directory, one level above this crate.
fn rust_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crate sits one level below the workspace directory")
        .to_path_buf()
}

/// Every `#[wasm_bindgen]` function in the wrapper, by the name JavaScript
/// calls it, read here rather than through the generator.
///
/// Deliberately a second reading of the same file: a check that asked the
/// generator what it had found would agree with itself whatever it skipped.
/// An attribute with no `js_name` falls back to the Rust name, as
/// `wasm-bindgen` does.
fn declared_exports(wrapper: &Path) -> Vec<String> {
    let source = std::fs::read_to_string(wrapper).expect("reading the wrapper");
    let file = syn::parse_file(&source).expect("parsing the wrapper");
    let mut names = Vec::new();
    for item in &file.items {
        let syn::Item::Fn(f) = item else { continue };
        let Some(attr) = f.attrs.iter().find(|a| a.path().is_ident("wasm_bindgen")) else {
            continue;
        };
        let mut js_name = None;
        let _ = attr.parse_nested_meta(|meta| {
            if meta.path.is_ident("js_name") {
                js_name = meta
                    .value()
                    .ok()
                    .and_then(|v| v.parse::<syn::Ident>().ok())
                    .map(|i| i.to_string());
            }
            Ok(())
        });
        names.push(js_name.unwrap_or_else(|| f.sig.ident.to_string()));
    }
    names
}

/// The wrapper's exports and the model's exports are the same set.
///
/// This is what makes enrolment automatic rather than remembered: a sixth
/// `#[wasm_bindgen]` function fails here until the generator resolves it.
#[test]
fn every_wasm_export_is_resolved() {
    let root = rust_root();
    let model = tradecraft_typegen::read(&root).expect("reading the crates");

    let declared = declared_exports(&root.join("tradecraft-wasm/src/lib.rs"));
    let resolved: Vec<String> = model.exports.iter().map(|e| e.js_name.clone()).collect();

    // Both lists are in wrapper declaration order, so this compares the names
    // and their order, not just how many there are.
    assert_eq!(
        resolved, declared,
        "the wrapper declares {declared:?} and the generator resolved {resolved:?}"
    );

    for export in &model.exports {
        // A request with no response would mean a report crossing back
        // untyped, which is the hole this crate closes. The reverse is fine
        // — `knownTargets` takes no request and still hands back a typed
        // list — so only that direction is checked.
        assert!(
            export.request.is_none() || export.response.is_some(),
            "`{}` takes a request but returns no typed response",
            export.js_name
        );
    }
}

/// `validateNamespace` has no JSON on either side.
///
/// Recorded as a fact rather than a gap: its signature is
/// `validateNamespace(stem: string): void`, so there is no request or response
/// shape for the gate to compare and none for it to invent.
#[test]
fn validate_namespace_has_no_json_boundary() {
    let model = tradecraft_typegen::read(&rust_root()).expect("reading the crates");
    let export = model
        .exports
        .iter()
        .find(|e| e.js_name == "validateNamespace")
        .expect("the wrapper exports validateNamespace");
    assert!(export.request.is_none() && export.response.is_none());
}

/// The generated file on disk is what the current Rust source produces.
///
/// `cargo test -p tradecraft-typegen` fails when the committed file is stale.
#[test]
fn the_committed_file_matches_the_source() {
    let root = rust_root();
    let generated = tradecraft_typegen::generate(&root).expect("generating");
    let committed = std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join(tradecraft_typegen::OUTPUT),
    )
    .expect("reading the committed file");

    if committed != generated {
        let first_difference = committed
            .lines()
            .zip(generated.lines())
            .position(|(a, b)| a != b)
            .map(|i| i + 1)
            .unwrap_or_else(|| committed.lines().count().min(generated.lines().count()) + 1);
        panic!(
            "{} differs from the Rust source, \
             first at line {first_difference}. Run `cargo run -p tradecraft-typegen`.",
            tradecraft_typegen::OUTPUT
        );
    }
}

/// The emit is a pure function of the source: two runs, one string.
///
/// The gate compares bytes, so a generator whose output depended on hash order
/// or on a formatter's version would fail CI for a difference nobody made.
#[test]
fn the_emit_is_deterministic() {
    let root = rust_root();
    let first = tradecraft_typegen::generate(&root).expect("generating");
    let second = tradecraft_typegen::generate(&root).expect("generating");
    assert_eq!(first, second);
}

/// `Diagnostic` and its peers live in `agent-adapt/src/diagnostic.rs`, outside
/// `core_src`, and reach the model only because `read` names that file as an
/// extra source. Walking a synthetic export that returns `Diagnostic` through
/// the emitter is what proves the whole wiring works: the extra sources are
/// read, everything the type reaches resolves, and the flattened
/// `DiagnosticScope` has a TypeScript shape. Merely finding the names in the
/// model would pass with an emitter that cannot spell any of them.
#[test]
fn a_diagnostic_export_emits() {
    let mut model = tradecraft_typegen::read(&rust_root()).expect("reading the crates");
    model.exports.push(tradecraft_typegen::parse::Export {
        js_name: "diagnosticProbe".to_string(),
        request: None,
        response: Some(("Diagnostic".to_string(), false)),
    });

    let ts = tradecraft_typegen::emit::emit(&model).expect("emitting a Diagnostic export");

    // The flat wire — one object with a `scope` tag — as an intersection.
    assert!(
        ts.contains("export type Diagnostic = {") && ts.contains("} & DiagnosticScope;"),
        "`Diagnostic` did not emit as an intersection with its flattened scope:\n{ts}"
    );
    for declaration in [
        "export type DiagnosticScope =",
        "export type Severity =",
        "export type DiagnosticCode =",
        "export type RuntimeId =",
        "export type ConceptKind =",
    ] {
        assert!(
            ts.contains(declaration),
            "`{declaration}` is missing; is every type `Diagnostic` reaches named in \
             tradecraft_typegen::read's extra sources?"
        );
    }
}
