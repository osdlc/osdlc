# Changelog

## Unreleased

- First version: `ts-packages-ci.yml` (the package pick, the conformance
  check and the `verify` matrix) and `ts-packages-release.yml` (the Version
  Packages pull request and the trusted-publishing release), moved out of
  osdlc/osdlc's `packages-ci.yml` and `packages-publish.yml`, which now call
  them.
- `ts-packages-release.yml` takes `ts-checks` (default `true`) and
  `package-globs` (default empty), so a workspace of packages with no code,
  such as osdlc/models, can call it. `ts-checks: false` skips the build and
  `package-checks ts`; `package-globs` names the package folders the pack job
  checks are on npm, in place of the `tsDir` of package-checks.json.
- `test.sh` checks the release workflow's "not on npm yet" step, and
  `ts-packages-test.yml` runs it on pull requests that touch it.
