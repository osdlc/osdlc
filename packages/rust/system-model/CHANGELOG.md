# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The model types and `build_dependency_graph`, moved from the `manifest-graph` crate.
- `walk_manifests` and `scan_aspects`, moved from the same crate.
- `apply_containment`, moved from the same crate.
- The wire schema (`schema::SystemGraph` and friends), moved from SDF desktop, so this crate is the authority on the shape, and `build_system_graph`, which fills it in.
