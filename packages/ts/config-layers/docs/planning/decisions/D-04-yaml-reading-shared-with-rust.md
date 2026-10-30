---
id: D-04
type: decision
state: accepted
created: 2026-10-20
---

# D-04: YAML reading rules shared with the Rust crate

## Decision

A config file read here and one read by the Rust crate `config-layers` mean the
same thing. These rules hold in both:

- Only `true` and `false` are booleans. `yes`, `no`, `on` and `off` are
  strings.
- A scalar key such as `1` is the string `"1"`. A list, mapping or null key is
  an error.
- `.inf`, `-.inf` and `.nan` read as strings, because JSON cannot hold them.
- `<<` is an ordinary key, not a merge.
- A tag on a string or an integer (`!!str 5`, `!!int "7"`) is dropped and its value kept.
- A duplicate key is an error.

`packages/conformance/config-layers/suite.json`, the family's conformance
suite, holds cases for these rules. Both packages' tests run it.

## Why

- A project file is read by tools in both languages. The same file must not
  give a different config in each.
- YAML 1.1 booleans (`yes`, `on`) change a value without a warning. The strict
  reading is safer for a config file.
- One fixture read by both suites keeps the twins from drifting.

## Consequences

- Some behaviour is not shared and stays out of the fixture. The README's
  "Rust twin" table lists it: integers beyond 2^53, `1e999`, `1_000`, `0b11`,
  `!!float` and unknown tags (text in TypeScript, numbers in Rust). An empty
  document is shared: `readMappingFile` and `read_mapping` both give an empty
  mapping.
- A rule added to one side goes into the fixture first.
