# Intersect fixture corpus

Data-driven spec for the Intersect library. Each `*.cases.json` file specifies
one area's intended behavior as a list of cases. The harness
(`../tests/fixtures.test.ts`) loads every file via `../fixtures.ts` and runs each
case against the public API. Cases marked `"pending": true` register as
`test.todo`; the rest run and assert. The `expect` values state the intended
semantics.

## File schema

A case file is a single JSON object:

```json
{
  "op": "<default-operation>",
  "cases": [
    { "name": "…", "<inputs>": …, "expect": …, "pending": true }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `op` | string | The default operation every case in the file targets. |
| `cases` | array | The cases. Each `name` is unique within the file. |

### Case fields

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Unique, human-readable label. Required. |
| `op` | string | Optional per-case override of the file's default `op`. |
| *inputs* | varies | Op-specific input fields — see the table below. |
| `opts` | object | Optional matching options (`Options` / `FsOptions`). |
| `tree` | string[] | **fs cases only.** Relative file paths to materialize under a temp dir before the op runs (see below). |
| `expect` | any | The intended return value; asserted with deep-equality. |
| `throws` | boolean | The call is expected to throw (sync) or reject (async). Use instead of `expect`. |
| `pending` | boolean | Register as `test.todo` (unimplemented). |

A case must state an expectation: either an `expect` value **or** `throws: true`.

### Inputs by operation

The file-level `op` is a default; a case may override it with its own `op` (an
`options` file, for instance, exercises several ops). The effective op selects
which input fields the case must carry:

| Op | Layer | Required inputs | Public function |
|---|---|---|---|
| `segments.intersects` | L0 core | `a`, `b` (segment arrays) | `segments.intersects` |
| `segments.matches` | L0 core | `path`, `pattern` (segment arrays) | `segments.matches` |
| `segments.witness` | L0 core | `a`, `b` (segment arrays) | `segments.witness` |
| `intersects` | L1 path | `a`, `b` (`Patterns`) | `intersects` |
| `matches` | L1 path | `path` (string), `patterns` (`Patterns`) | `matches` |
| `whichMatch` | L1 path | `path` (string), `patterns` (`Patterns`) | `whichMatch` |
| `overlapping` | L1 path | `query` (`Patterns`), `candidates` (string[]) | `overlapping` |
| `witness` | L1 path | `a`, `b` (`Patterns`) | `witness` |
| `registry.applicableTo` | L1 registry | `entries` (`Labeled[]`), `scope` (`Patterns`) | `index(entries).applicableTo(scope)` |
| `registry.matching` | L1 registry | `entries` (`Labeled[]`), `path` (string) | `index(entries).matching(path)` |
| `fs.filesInScope` | L2 fs | `patterns` (`Patterns`) | `filesInScope` |
| `fs.resolveIntersection` | L2 fs | `a`, `b` (`Patterns`) | `resolveIntersection` |

`Patterns` is `string | string[]` (an array is a pattern set — its union). L0
inputs are already-split segment arrays (`["src","**","*.vue"]`); L1 inputs are
path-like glob strings (`"src/**/*.vue"`).

### fs cases run as integration tests

The `fs.*` ops read disk, so their cases are **not** run by the generic harness
(`../tests/fixtures.test.ts`), which skips the `fs.*` namespace. They run only
through `../tests/fs.test.ts`, which for each case materializes the case's
`tree` (a list of relative file paths, created empty) under a fresh
`os.tmpdir()` directory, runs the op with `cwd` set to that dir, asserts the
result equals `expect` order-insensitively, and removes the temp dir. Every
fs case must declare a `tree`. Both harnesses still schema-lint `fs.cases.json`.

## Corpus files

| File | Area |
|---|---|
| `segments.cases.json` | L0 segment core — `intersects` / `matches` / `witness` over segment arrays. |
| `path.cases.json` | L1 path API — exact match vs. subtree, `*`/`?`, braces, character classes. |
| `options.cases.json` | Dialect options — `dot`, `caseInsensitive`, `globstarMatchesZero`. |
| `overlapping-witness.cases.json` | `overlapping` (conflict subset, in order) and `witness` (common path / null). |
| `registry.cases.json` | The labeled-pattern registry — order preservation, `matching`, duplicate-id throws. |
| `fs.cases.json` | L2 filesystem — `filesInScope` / `resolveIntersection`, run as temp-tree integration tests by `../tests/fs.test.ts` (see above). |

## Adding a case

1. Pick the area file (or its op override).
2. Give a unique `name` and the op's required inputs.
3. Set `expect` to the intended result (or `throws: true`).
4. While the operation is unimplemented, set `"pending": true`; drop it to run
   the case for real once the engine lands.
