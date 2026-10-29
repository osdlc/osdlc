# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - Unreleased

### Changed

- The CLI is now [skillwright](https://crates.io/crates/skillwright). The
  binary prints where it moved and exits with status 1.

### Removed

- The library modules and the `test-support` feature. They are now in
  skillwright. The library keeps only `tradecraft::NOTICE`.
