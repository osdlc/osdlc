# Contributing

Changes go through pull requests on the repository that hosts this crate.
Open an issue first for anything larger than a small fix, so we can agree on
the direction before you spend time on it.

Pull requests are taken. A good pull request:

- changes one thing,
- adds or updates a test in `src/tests.rs`, including a case for any change
  to how a link is rewritten,
- updates `CHANGELOG.md` under "Unreleased",
- builds and passes `cargo test` on the minimum Rust version in the README.

A plan must write nothing, and an apply must write each file under
compare-and-swap. If you change either rule, say so in the pull request and
say how you checked it.

By contributing you agree that your work is licensed under MIT OR Apache-2.0,
the same as the crate.
