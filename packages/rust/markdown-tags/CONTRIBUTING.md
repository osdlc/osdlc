# Contributing

Changes go through pull requests on the repository that hosts this crate.
Open an issue first for anything larger than a small fix, so we can agree on
the direction before you spend time on it.

Pull requests are taken. A good pull request:

- changes one thing,
- adds or updates a test, including a case in the conformance suite,
  `packages/conformance/markdown-tags/suite.json`, when tag behaviour changes.
  Write the case's `input` by hand and run
  `cargo run -p markdown-tags --example conformance-write` from
  `packages/rust` to write its `expect`. The TypeScript twin
  `@osdlc/markdown-tags` runs the same suite, so a change to tag behaviour
  lands in both packages in one pull request,
- gives a new public item a doc comment with an example, and a use in
  `examples/`,
- updates `CHANGELOG.md` under "Unreleased",
- builds and passes `cargo test` on the minimum Rust version in the README.

The settled design choices are in `decisions/`. If you change one, say which
and why.

By contributing you agree that your work is licensed under MIT OR Apache-2.0,
the same as the crate.
