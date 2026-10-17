---
id: D-05
type: decision
state: accepted
created: 2026-10-17
---

# D-05: Keys match case-insensitively

## Decision

- `editYaml` matches keys case-insensitively: both sides are lowercased and
  nothing else is normalized. Two existing keys that differ only in case make
  an edit of either one `AmbiguousKey`.
- The package has no option for exact matching. The crate has one
  (`EditOptions::case_sensitive`); the two corpus fixtures that need it are
  skipped in this package's tests.

## Why

- The main use is Markdown frontmatter, where editors treat `Title` and
  `title` as the same field.
- An options argument can be added later as a minor feature, without
  changing the default.

## Consequences

- When exact matching is added, the two skipped fixtures run here too.
