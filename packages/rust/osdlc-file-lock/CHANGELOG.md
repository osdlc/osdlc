# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-19

A change to the on-disk protocol: `osdlc-file-lock` and `@osdlc/file-lock` 0.4
judge a takeover marker the same way, and a 0.3 reaper's marker looks dead to
them, so upgrade both together.

### Fixed

- On Windows, two claimants racing over one stale lock could both win. A
  takeover marker was a hard link of the lock, so its mtime was the lock's
  and a live reaper's marker looked dead to the next claimant, which cleared
  it. The marker is now an empty file of its own, created exclusively, and
  its age is its own mtime. A marker older than `MARKER_STALE` (10 s) is a
  dead reaper's and is cleared on every OS, Windows included; no ctime is
  read.

## [0.3.0](https://github.com/osdlc/osdlc/releases/tag/osdlc-file-lock/v0.3.0) - 2026-11-18

### Other

- Rust twin of @osdlc/file-lock, held to one protocol ([#691](https://github.com/osdlc/osdlc/pull/691))

### Added

- First release: the Rust implementation of `@osdlc/file-lock`'s protocol, so
  a Rust process and a Node.js process can hold one lock file in turn.
  `claim_lock` hard-links a fully written JSON lock into place and takes over
  a stale lock through a hash-named marker; `touch_lock`, `update_lock` and
  `release_lock` act only while the lock holds the claim's token;
  `untouched_for` is the age rule; `with_lock` runs a closure holding the
  lock. The `file-lock` conformance suite holds both implementations to one
  protocol.
