---
id: TM-05
type: term
state: accepted
created: 2026-10-19
---

# TM-05: Separator folding

## Definition

Replacing `\` with `/` so one separator remains. `validateRelative` (Rust:
`validate_relative`) does this before it splits the path into
[segments](TM-06-segment.md).

## Contrast

Not the whole normalised form. Folding is one step of it, and it changes only
the separator. Trailing slashes are trimmed separately. Folding does not
collapse `.`, `..` or empty segments. The [lexical](TM-02-lexical.md) check
refuses those.

## Notes

After folding, `a\..\b` reads as `a/../b` and is refused as `parent_segment` (Rust: `PathError::ParentSegment`).
Without it, the backslashes would hide the `..` from the split.
