---
id: TM-06
type: term
state: accepted
created: 2026-10-19
---

# TM-06: Segment

## Definition

The part of a path between slashes. An empty or `.` segment is degenerate.
`..` is a parent segment.

## Contrast

Not a character. A segment is the whole run between two slashes. In `a//b` the
middle segment is empty.

## Notes

The [lexical](TM-02-lexical.md) check refuses both kinds, as error kinds
`degenerate_segment` and `parent_segment`. It splits on `/` only after
[separator folding](TM-05-separator-folding.md). A trailing slash is trimmed
before the split, so `a/` is accepted and has one segment.
