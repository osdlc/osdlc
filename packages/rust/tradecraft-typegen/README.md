# tradecraft-typegen

Emits [`generated/core.generated.ts`](generated/core.generated.ts) from the
Rust source of `tradecraft-core`, `tradecraft-wasm` and `agent-adapt`: the
TypeScript declarations for every request and response that crosses the wasm
boundary.

It is a build tool. It is not published to crates.io (`publish = false`), and
nothing depends on it. The generated file is committed in this crate. A
TypeScript package that wraps `tradecraft-wasm` copies or imports it from here.

## Why it exists

Every wasm export takes a JSON string and returns a JSON string. The
TypeScript compiler checks nothing about either. Hand-written TypeScript types
drift from the Rust structs without any error: a Rust enum gains a variant, the
TypeScript switch over it still looks exhaustive, and the new case prints as
`undefined`. Here the TypeScript is generated, and a test fails when the
committed file is stale.

## Running it

From `packages/rust/`:

```console
cargo run -p tradecraft-typegen             # rewrite the generated file
cargo run -p tradecraft-typegen -- --check  # report drift, write nothing
cargo test -p tradecraft-typegen            # the same check, plus the coverage tests
```

`cargo test --workspace` runs the last one, so CI fails a pull request that
changes a wire type without regenerating the file.

## What it reads, and how enrolment stays automatic

The generator resolves each export from its own body, so nothing has to be
registered anywhere:

| Question | Answered from |
|---|---|
| Which exports are there? | `#[wasm_bindgen(js_name = …)]` in `tradecraft-wasm/src/lib.rs` |
| What does an export deserialize? | its `let wire: T = serde_json::from_str(request_json)` |
| What does it hand back? | the return type of the core function its body calls — or, for an export with no function to call, the type of the core constant it hands back (`knownTargets` -> `KNOWN_TARGETS: &[&str]`) |
| What do those types look like? | the public structs and enums of `tradecraft-core` |

A sixth export is covered the day it is written. `tests/every_export_is_covered.rs`
asserts that the exports the wrapper declares and the exports the generator
resolved are the same set, so an export whose shape the generator cannot follow
fails rather than being skipped.

`validateNamespace` is the one export with no JSON on either side — its
signature is `validateNamespace(stem: string): void`. That is recorded as a
fact (`WasmExportsWithoutJson`), not treated as a gap.

## Why source, not derives

The alternative was `schemars` or `ts-rs` derives on the core's request and
report types. That puts a boundary concern inside `tradecraft-core`, which
deliberately holds none: the wasm wrapper exists precisely so the core compiles
for every native caller without a wire dependency. Reading the source keeps
that split, at the cost of one parser.

## Why no formatter

The gate compares bytes. An emit that ran a third-party formatter would make a
formatter upgrade look like surface drift, and the pull request that upgraded
it would be red for a change nobody made. The emit is a pure function of the
parsed model, and `the_emit_is_deterministic` asserts it.

## How a type becomes TypeScript

| Rust | TypeScript |
|---|---|
| `String`, `PathBuf` | `string` |
| `bool` | `boolean` |
| any integer or float | `number` |
| `serde_json::Value` | `unknown` |
| `Vec<T>` | `T[]` |
| `BTreeMap<K, V>` | `Record<K, V>` |
| unit-only enum | a string union, after `rename_all` |
| `#[serde(tag = "…")]` enum | a discriminated union of object types |
| `#[serde(flatten)]` field | the target's fields, spliced in |

Optionality follows direction. A request is deserialized, so anything serde can
default is optional — `mode?: PublishMode`. A response is serialized, so an
`Option<T>` is `T | null` unless the field carries `skip_serializing_if`, which
makes it optional instead. A type reached in both directions is refused rather
than emitted under one spelling.

A wire wrapper is named for the type it flattens: `WireExportRequest` splices
`ExportRequest` and one extra key, and the wire it describes is an export
request. A wrapper that flattens nothing loses a leading `Wire`, which is how
`WireDiscoverRequest` becomes `DiscoverRequest`.

## What it refuses

Refusals name the type and say what to do. The generator stops rather than
guessing on a tuple variant, an untagged data enum, a duplicated public type
name, a flattened field that is not a struct, and a type reached as both a
request and a response.
