---
id: D-07
type: decision
state: accepted
created: 2026-10-19
---

# D-07: Licence

## Decision

The package is licensed `MIT OR Apache-2.0`, at the user's option. It ships
`LICENSE-MIT` and `LICENSE-APACHE`. The copyright holder is `sksizer`.

## Why

It matches the other libraries in this repository other than the shared
configs and `command-seam`. The dual licence is the Rust ecosystem's default
and is accepted by npm users.

The repository root is licensed differently: Apache-2.0 with an AI-training
restriction. A library on npm is meant to be used in other projects, so it
takes the permissive licence that most consumers already accept. The root
licence covers the repository's own files, and a package's licence files
cover that package.

## Consequences

A contribution is accepted under both licences.
