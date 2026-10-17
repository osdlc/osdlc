---
id: D-01
type: decision
state: accepted
created: 2026-10-17
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/frontmatter-lossless`, published to npm from this
  repository, `packages/ts/frontmatter-lossless`.
- It does one job: find a note's `---` YAML frontmatter block, return its text
  and the body with offsets, and rebuild the note byte for byte. It does not
  parse YAML values, read files, or parse the Markdown body.

## Why

- The name matches the `frontmatter-lossless` Rust crate, its twin. It was
  free on npm and crates.io, and no package with a similar name does the same
  job.
- Popular frontmatter packages parse the YAML and serialize it again, so a
  rewritten note can differ from the original when no value changed. No npm
  package found splits and rebuilds a note byte for byte with offsets.
- Keeping YAML out keeps the package free of dependencies. A YAML parser or
  editor works on the `yaml` string, one layer up.

## Consequences

- A request to read or edit YAML values belongs in another package.
- Other frontmatter formats (`+++` TOML, `;;;` JSON) are out of scope.
