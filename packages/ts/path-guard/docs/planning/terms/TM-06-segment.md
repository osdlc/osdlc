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

Not a Rust `Component`. A segment is the text between two slashes, so `a//b`
has an empty middle segment. `Path::components` skips empty segments and also
yields root and prefix components, so the two do not line up.

## Notes

The [lexical](TM-02-lexical.md) check refuses both kinds, as error kinds
`degenerate_segment` and `parent_segment` (Rust: `PathError::DegenerateSegment`
and `PathError::ParentSegment`). It splits on `/` only after
[separator folding](TM-05-separator-folding.md). A trailing slash is trimmed
before the split, so `a/` is accepted and has one segment.
