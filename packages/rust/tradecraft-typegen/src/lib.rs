//! The generator behind `generated/core.generated.ts`: the TypeScript
//! declarations for the `tradecraft-wasm` requests and responses.
//!
//! A library as well as a binary so the tests can call [`generate`] and assert
//! against what it produces, rather than shelling out to the binary and
//! reading a file.
//!
//! Reads the core's source rather than deriving from it (`schemars`, `ts-rs`)
//! because a derive would put a boundary concern — how a type looks to
//! JavaScript — inside `tradecraft-core`, which deliberately carries no wire
//! dependency.

pub mod emit;
pub mod parse;

use std::path::Path;

/// Where the generated file lands, relative to this crate's directory.
pub const OUTPUT: &str = "generated/core.generated.ts";

/// The generated TypeScript for the crates under `rust_root`, the Cargo
/// workspace directory that holds `tradecraft-core`, `tradecraft-wasm` and
/// `agent-adapt`.
pub fn generate(rust_root: &Path) -> Result<String, String> {
    emit::emit(&read(rust_root)?)
}

/// The parsed wasm surface: the exports, and every type they carry.
pub fn read(rust_root: &Path) -> Result<parse::Model, String> {
    parse::read(
        &rust_root.join("tradecraft-core/src"),
        &rust_root.join("tradecraft-wasm/src/lib.rs"),
        // `Diagnostic` and the types it reaches: `DiagnosticScope` carries a
        // `RuntimeId` and a `ConceptKind`, which live beside it in agent-adapt
        // rather than in the core.
        &[
            rust_root.join("agent-adapt/src/capabilities.rs"),
            rust_root.join("agent-adapt/src/diagnostic.rs"),
            rust_root.join("agent-adapt/src/runtime.rs"),
        ],
    )
}
