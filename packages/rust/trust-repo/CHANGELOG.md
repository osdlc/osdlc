# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-27

First release on crates.io. The Rust port of the whole-repository part of
`@osdlc/trust-repo`, numbered with it: 0.5.0 matches the TypeScript package's
0.5 line, and the two share one store on disk.

### Added

- `TrustStore`, a folder of marker files with one per trusted repository, kept
  under the XDG state home outside every checkout, and `trust_store_dir`, which
  finds it from the variables and home folder the caller passes in.
- `resolve_exec_gate`, the rule that combines the store with a per-run flag into
  whether a repository's own scripts may run, and `withheld_hint`, the message
  that says how to grant trust.
- The crate reads no environment and starts no program, so a test never touches
  the real store.

Not ported: per-scope grants, the standing policy, and `tighten`.
