# finding-formats

Turns what a tool printed into `Finding`s (a SARIF subset) and `Facts` (named
values). Text in, `Report` out; no I/O, no knowledge of whatever runs the tool.

## Install

```sh
cargo add finding-formats
```

## Quick start

```rust
use finding_formats::{read, Format, Options};

let report = read(Format::Lines, "src/a.rs:3: unused import\n", &Options::default())?;
assert_eq!(report.findings[0].path.as_deref(), Some("src/a.rs"));
# Ok::<(), finding_formats::Error>(())
```

`Report { findings, facts, unmatched }` serialises to JSON
(`unmatched` only when non-empty). Rules are reported bare; a runner that
runs several checks can prefix each with the check's name, as `<check>/<rule>`.

Readers are tolerant: unknown fields, elements and records are ignored. A
malformed document is its format's `Error` variant, saying where; a
well-formed one with nothing in it gives no findings and zero counts.

## Formats

### lines

One finding per line. The default layout is `path:line: message` or
`path:line:col: message`. `Options` hold:

- `pattern`: a regular expression with named groups `path`, `line`, `col`,
  `level`, `rule`, `message`. Only `message` is required.
- `levels`: tool level word to `note`/`warning`/`error`. Unmapped words fall
  back to common ones (`warn`, `info`, `hint`, ...), then to `error`.

A Windows `C:\src\a.rs:12: msg` keeps its drive and becomes `C:/src/a.rs`.
Non-blank lines that do not match are returned in `Report::unmatched`; the
nothing follows from them.

### sarif

```rust
use finding_formats::{read, Format, Options};

let report = read(Format::Sarif, r#"{"runs":[]}"#, &Options::default())?;
assert!(report.findings.is_empty());
# Ok::<(), finding_formats::Error>(())
```

### junit

```rust
use finding_formats::{read, Format, Options};

let report = read(Format::Junit, "<testsuite/>", &Options::default())?;
assert!(report.findings.is_empty());
# Ok::<(), finding_formats::Error>(())
```

### lcov

```rust
use finding_formats::read_lcov;

let coverage = read_lcov("SF:a.rs\nDA:1,1\nend_of_record\n")?;
assert_eq!(coverage.files[0].lines.hit, 1);
# Ok::<(), finding_formats::Error>(())
```

`read(Format::Lcov, ..)` gives the overall facts; `read_lcov` also gives the
per-file totals.

## Mapping

| format | input | finding field | facts |
|--------|-------|---------------|-------|
| lines | `path` group | `path` (normalised) | none |
| | `line` group | `line` | |
| | `level` group | `level` via `levels`; default `error` | |
| | `rule` group | `rule`; default `lines` | |
| | `message` group | `message` | |
| | `col` group | `col` | |
| sarif | `ruleId`, else `rule.id`, else the `id` of the rule at `ruleIndex`, else at `rule.index` (an index that is negative, past the last rule, or written with a fraction or exponent names no rule) | `rule`; default `sarif` | `results`, `results_error`, `results_warning`, `results_note` |
| | `level`, else the rule's `defaultConfiguration.level`, else `warning`; `none` is `note`, an unknown word `warning` | `level` | |
| | `message.text`, else `message.markdown` | `message` | |
| | first location `artifactLocation.uri`, `file://` stripped | `path` (normalised) | |
| | `region.startLine` / `startColumn` / `endLine` (a number written with a fraction or an exponent, below 1 or too large for a line is none) | `line` / `col` / `end_line` | |
| | first of `partialFingerprints`, else `fingerprints` | `fingerprint` | |
| junit | `<failure>` / `<error>` in a `<testcase>` | one finding, level `error` | `tests`, `failures`, `errors`, `skipped`, `time` |
| | `classname` + `.` + `name`, or `name` alone when `classname` is absent or empty | `rule` | |
| | `message` attribute, else first non-blank line of the text, else `type`, else `test failed` / `test errored` | `message` | |
| | `file`, `line` attributes | `path` (normalised), `line` | |
| lcov | `SF` (or upstream lcov's synonym `KF`), `DA`, `LF`, `LH` | none | `files`, `lines_found`, `lines_hit`, `lines_percent` |
| | `BRDA`, `BRF`, `BRH` | | `branches_*` when present |
| | `FN`, `FNDA`, `FNF`, `FNH` | | `functions_*` when present |
| | a blank line or `#` comment, anywhere | skipped | |

In every format a path uses `/`, is normalised lexically, and is joined onto
the `paths_from` option when relative; an empty `paths_from` is the repository
root, like `.`. An empty path (a SARIF `"uri": ""` or bare `file://`, a JUnit
`file=""`) is no path. A line or column below 1 is none.

`lines_percent` (and the branch and function equivalents) is rounded to two
decimals and omitted when nothing was found. `time` is the sum of the test
cases' `time`, else the root element's.

## Deliberately not read

- SARIF: `originalUriBaseIds` (a `uriBaseId` is not resolved; the uri is left
  as given), percent-decoding of uris, locations after the first, `codeFlows`,
  `suppressions`, `fixes`.
- JUnit: `<system-out>`, `<system-err>`, `<properties>`, and the suites' own
  count attributes (counts come from the test cases, so nesting never double
  counts). `<skipped>` is counted, not reported.
- lcov: merging records for the same file, checksums on `DA`, line numbers of
  functions.
- `lines`: multi-line messages.

## Dependencies

No format crate is used. SARIF is `serde` structs, JUnit is `quick-xml`, lcov
is a line parser and `lines` is `regex`.

| Crate | Why not |
|-------|---------|
| `serde-sarif` | It rejects documents this reader accepts: no `version`, a run without `tool`, a result without `message`, a `level` it does not know, and `"runs": null`, which the SARIF specification allows. It also generates the whole schema with builders at build time, for a subset read here with a few structs. |
| `quick-junit` | It rejects a bare `<testsuite>` root, drops the test cases of a suite nested in a suite, and rejects a test case with no `name`, with both `<failure>` and `<error>`, or with a `time` that is not a number. It keeps `file` and `line` as untyped extras, and depends on `chrono`, `uuid` and `indexmap`. |
| `junit-parser` | It keeps one status per test case, so a case with a `<failure>` and an `<error>`, or with two `<failure>`s, gives one result where this reader gives two findings. A `time` or `line` that is not a number rejects the whole document. |
| `lcov` | It fails on a record it does not know (`VER`, `FNL`, `FNA`, `MCDC`), and this reader ignores them. It also fails on a blank line, a trailing space after a count, a `BRDA` with an exception block, and a last record with no `end_of_record`. |

Checked 2026-11-16.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
