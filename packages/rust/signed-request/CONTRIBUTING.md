# Contributing

Changes go through pull requests on the repository that hosts this crate.
Open an issue first for anything larger than a small fix, so we can agree on
the direction before you spend time on it.

Pull requests are taken. A good pull request:

- changes one thing,
- adds or updates a test, and for a change to what a verifier accepts or
  refuses, a test that signs the request and checks the result,
- updates `CHANGELOG.md` under "Unreleased",
- passes `cargo test --all-features` and `cargo test` on the minimum Rust version in the README,
- keeps the wire format as it is, unless the change is about the wire format: the vectors in
  `tests/vectors.json` are produced by `tests/gen_vectors.py` and a change to them breaks every peer.

A change that lets more requests through a verifier needs a reason in the pull
request: which request, why it is safe, and the test that proves it.

By contributing you agree that your work is licensed under MIT OR Apache-2.0,
the same as the crate.
