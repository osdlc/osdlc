# Domain: api

Read by `/discuss` for a change to a library's public API, in TypeScript or a similar typed
language: a new option, a widened parameter, a new function, a changed return shape, a removal.

## Blocks

- One `annotated-text` block (`language` set to the library's language) for the proposed call
  sites, after the problem `prose`: how a caller writes each new or changed call. One step per
  function or option that changes.
- A `matrix` block for trade-offs between options or for compatibility: rows are the changes,
  columns are the callers, runtimes or versions they must work with.
- A `plan` block for the rollout: one phase per release, one task per PR.

A `signature` block would fit better than `annotated-text` and does not exist yet. Suggested
fields, one node per function:

- `name`, `parameters` (name, type, optional, default), `returns` (the type, and the shape on
  failure).
- `status`: `new`, `changed`, `unchanged` or `removed`.
- `before` for a `changed` node, so the page can show the old and new signature side by side.
- `summary`, `detail`, `risk`, `warnings`, `source`, as other blocks carry them.

Until it lands, write each function as one `annotated-text` step and put its status first in the
`summary`.

## Fields per node

- `summary`: one line on what the caller gets.
- `detail`: the signature, its defaults, and what it returns on success and on failure.
- `risk`: who breaks and how. `annotated-text` has no `risk` field, so end `detail` with a
  `Risk:` line.
- A `warning` wherever the node depends on something outside the library: an external tool's
  output or exit code, a runtime, a peer dependency.
- `source` once the code exists, so the review links to the lines.

## Safety test

A node is unsafe when:

- It breaks existing callers and does not say so, or does not name the migration.
- It changes behaviour under the same signature: a new default, a different return on failure,
  a thrown error where a value came back.
- Its correctness depends on an external tool's behaviour and no `warning` names what to verify
  (the version, the flag, the output format).

Split: a silent behaviour change becomes two nodes, the new behaviour behind a new name or
option, and a deprecation or `Breaking:` note on the old one with its migration. A dependency on
an external tool gets a `warning` naming the check.

## Grouping

Group nodes by capability area (options, reads, writes, errors), or by the rollout PR that
ships them when the `plan` already splits the work. Additive changes ship before breaking ones.

## Questions

Always ask:

- What each new or changed call returns on failure: a thrown error, a result type, `null`.
- Breaking or additive: whether to take the break now or ship behind a new name.
- Defaults: what a new option defaults to, and whether the default matches today's behaviour.

Add one for every other trade-off: option bag or positional parameter, one wide function or
several narrow ones.

Ids: `api-<word>`, such as `api-timeout`.
