# Domain: sql

Read by `/discuss` for a database change. Option: `--base <schema doc id>` proposes
against a schema document instead of the repo's DDL.

## Blocks

One `operations` block (`language: sql`) with `phases`, after the problem `prose`. A `schema`
block for the tables as they are, when the reviewer has not seen them.

## Fields per operation

- `code`, `detail`, `risk`, `locks` in the dialect's own terms, `reversible`, and a `rollback`
  when it is not reversible.
- `before` and `after` shape fragments for every operation that alters a column.
- `source` once the migration file exists, so the review links to the lines.
- A `warning` wherever a step depends on the application: a dual-write deploy before a
  backfill, a release with no reader before a drop.

## Safety test

An operation is unsafe when it holds a long lock, rewrites the table, or loses data.

Split: add nullable, backfill in batches, validate `NOT VALID` then `SET NOT NULL`, drop one
release later.

## Grouping

`phases` separate additive from destructive, each phase one release. No operation in the
additive phase holds a lock longer than a catalog update.

## Questions

One for every trade-off: enum or lookup table, batch size, timing of the drop, who else reads
the old column.

Ids: `op-<word>`.
