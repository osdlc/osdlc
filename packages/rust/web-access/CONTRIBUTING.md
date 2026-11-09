# Contributing

Changes go through pull requests on the repository that hosts this crate.
Open an issue first for anything larger than a small fix, so we can agree on
the direction before you spend time on it.

Pull requests are taken. A good pull request:

- changes one thing,
- adds or updates a test, and for a change to what the guard accepts or
  refuses, a test that sends the request and checks the status,
- updates `CHANGELOG.md` under "Unreleased",
- builds and passes `cargo test` on the minimum Rust version in the README.

A change that lets more requests through the guard needs a reason in the pull
request: which request, why it is safe, and the test that proves it.

By contributing you agree that your work is licensed under MIT OR Apache-2.0,
the same as the crate.
