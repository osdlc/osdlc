# agent-router

Picks the coding-agent CLI, model and effort to launch: references
(`tool/model[ctx=...]@effort`), the model catalogue and its layers, validity,
effort, context windows and the ordered profile walk with first-available
fallback, plus routing rules and bindings.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/agent-router` (reference) | TypeScript | `packages/ts/agent-router` |
| `agent-router` | Rust | `packages/rust/agent-router` |

The suite is split into one file per section, because it is over 1 MB as one
file. A file holds one section, named as the file is (`ref_parse.json` holds
`ref_parse`). Each section's `description` says what it checks. Write a new
case's `input` by hand, then run

```sh
pnpm --filter @osdlc/agent-router conformance:write
```

to write its `expect`. Never write an `expect` by hand.

Both runners also fail on a section file they do not run.

## Catalogue layers

Many inputs name a catalogue as `layers`. A string in it is a layer:

- `snapshot` is the shipped catalogue snapshot. The `snapshot_layer` section
  holds a copy as its one case's `expect`, so the Rust crate does not read the
  TypeScript package's `src/`. The generator writes it from
  `packages/ts/agent-router/src/catalogue/snapshot.json`, so a refreshed
  snapshot shows up as a change to this file.
- Any other name is a case of the `named_layers` section: the case's name is
  the layer's name, its `input.layer` is the layer, and its `expect` is the
  problems that laying it alone gives.

An object in `layers` is a literal layer.

## Comparison

Numbers compare by value: the TypeScript writes `15` where serde writes
`15.0`. The two implementations' zod and serde messages differ, so cases that
parse a shape drop the message from the result rather than comparing it.

## Not in the suite

- The author rule (`authorRule`, `sameToolAsAuthor` and the `wait` and `person`
  outcomes): only the TypeScript has it. The runner removes `sameToolAsAuthor`
  from a walk's result.
- The `./config` subpath (`RouterConfigSchema` and the config sections), and
  the models.dev fetch and mapping.
- The strict-schema message text and the Rust crate's differences listed in its
  README (integer-valued floats, key order of integer-like keys, unvalidated
  policy values).
