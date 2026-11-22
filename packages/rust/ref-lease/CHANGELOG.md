# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `push_outcome`, `fetch_failure` and `canonical_json`: the protocol half of
  `@osdlc/ref-lease`, checked against the shared conformance suite
  `packages/conformance/ref-lease/suite.json`. The git half (the push and
  fetch themselves) is not here yet.
