# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0]

First release on crates.io, as `glob-intersect` (the name `intersect` is
taken). The crate moved here from the sksizer/dev repository, where it was the
unpublished `intersect` 0.3.0, and is now the Rust twin of `@osdlc/intersect`
0.3.x.

### Changed

- The crate is `glob-intersect` and the library is `glob_intersect`.
- Licensed `MIT OR Apache-2.0`, like the rest of osdlc/osdlc.
- The conformance tests read `@osdlc/intersect`'s `fixtures/` in place
  instead of a pinned copy, and now also run its `dot` cases for the `fs`
  layer, which pass unchanged.

### Earlier history

Before the move, as `intersect` in sksizer/dev:

- 0.3.0: every function that reads a pattern returns `Result<_, Error>`;
  `Error::code()`; unsupported syntax and over-deep `{` nesting are refused;
  `matches` reads its path literally; ASCII-only case folding; `fs` no longer
  follows symbolic links and returns `Error::Io` for an unreadable `cwd`.
- 0.2.0: aligned with `@osdlc/intersect` 0.2.1.
- 0.1.1: five defects fixed in the segment automaton, path and filesystem
  layers.
- 0.1.0: initial port of the segment automaton, path API, registry and
  filesystem layer.
