# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-27

First release on crates.io.

### Added

- `read`, which turns the text a tool printed into a `Report` of `Finding`s (a
  SARIF subset) and `Facts` (named values).
- Four input formats: line-oriented text (a configurable regular expression
  with named groups), SARIF 2.1.0, JUnit XML and lcov.
- Tolerant readers: unknown fields and elements are ignored, and a malformed
  document is its format's `Error` variant saying where.
- Paths are normalised to `/` separators, including Windows drive paths, and
  joined onto an optional base folder.
