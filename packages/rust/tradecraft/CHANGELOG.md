# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1](https://github.com/osdlc/osdlc/compare/tradecraft/v0.4.0...tradecraft/v0.4.1) - 2026-10-31

### Other

- Remove the skillwright code that moved to osdlc/skillwright ([#556](https://github.com/osdlc/osdlc/pull/556))

## [0.4.0] - Unreleased

### Changed

- The CLI is now [skillwright](https://crates.io/crates/skillwright). The
  binary prints where it moved and exits with status 1.

### Removed

- The library modules and the `test-support` feature. They are now in
  skillwright. The library keeps only `tradecraft::NOTICE`.
