# Obsidian is the default dialect

## Decision

When a caller names no dialect, the `obsidian` dialect applies. It reads a
note the way a renderer that follows Obsidian's tag rule reads it.

## Why

A tag shown to a reader and a tag found by a tool should be the same tag. Most
callers have no reason to pick a rule, and the safe answer for them is the one
that matches what the note shows: code, link destinations and reference
definitions are not text, and a tag needs one character that is not a number.

The dialects `unicode` and `ascii` serve two narrower jobs (a search index
that must not lose tags, a link graph that must not read code samples), and a
caller with one of those jobs says so.

## Consequences

- `DEFAULT_TAG_DIALECT` and `TagDialect::default()` are `obsidian`, listed
  first in `TAG_DIALECTS` and `TagDialect::ALL`.
- Changing what the default dialect returns changes the output for existing
  input, so it is a breaking change and comes only in a new minor version
  while the version is 0.x.
