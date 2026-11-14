# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- First release: the Rust implementation of `@osdlc/file-lock`'s protocol, so
  a Rust process and a Node.js process can hold one lock file in turn.
  `claim_lock` hard-links a fully written JSON lock into place and takes over
  a stale lock through a hash-named marker; `touch_lock`, `update_lock` and
  `release_lock` act only while the lock holds the claim's token;
  `untouched_for` is the age rule; `with_lock` runs a closure holding the
  lock. The `file-lock` conformance suite holds both implementations to one
  protocol.
