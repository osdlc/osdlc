# Contributing

Changes go through pull requests on the repository that hosts this crate.
Open an issue first for anything larger than a small fix, so we can agree on
the direction before you spend time on it.

Pull requests are taken. A good pull request:

- changes one thing,
- adds or updates a test, including a case in `tests/fixtures/conformance.json`
  when link behaviour changes,
- updates `CHANGELOG.md` under "Unreleased",
- builds and passes `cargo test` on the minimum Rust version in the README.

Link resolution follows the behaviour table in
`decisions/behaviour-table-is-the-reference.md`. If you change it, say which
row you are changing and how you checked it.

By contributing you agree that your work is licensed under MIT OR Apache-2.0,
the same as the crate.
