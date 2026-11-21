---
type: backlog
schema_version: '3'
id: B-0001
tags:
  - system-cleanup
  - host-cleaner
  - corpus
  - npm
  - release
related:
  - https://github.com/osdlc/osdlc/issues/991
last_reviewed: '2026-11-21'
---
# Publish the system cleanup profile and reference

`@osdlc/corpus-profile-system-cleanup` (`packages/profiles/system-cleanup`) and
`@osdlc/corpus-system-cleanup-reference` (`packages/corpora/system-cleanup-reference`) are private
at 0.0.0. They live beside host-cleaner, their only user, which reads them through the pnpm
workspace. Its descriptors are drafted from the reference and committed, so host-cleaner's users
never need the corpus itself. Publish both to npm once something outside this repository needs
them.

What would call for it:

- **Another corpus extends the profile.** The validator finds a parent by package name, as Node.js
  finds a package, so a corpus outside this repository cannot extend the profile until it is on
  npm.
- **A tool wants the records.** For example, a cleaner other than host-cleaner, or a site built
  from the reference.
- **The schema settles.** The tiered contracts in #991 may still change the subjects and the
  statement fields. Once host-cleaner's first descriptors are drafted from the reference and
  released, a breaking change to the profile costs a breaking release.

To publish:

1. In each `package.json`, remove `"private": true`, set the first version (0.1.0), and add
   `publishConfig: { access: "public" }` and a `files` list (`corpus/`, `README.md` and the
   licenses), as the claims profile has them.
2. Name the parents as peer dependencies with `workspace:^`: the profile names the claims
   profile, and the reference names both profiles. Keep the `workspace:*` dev dependencies.
3. Stage both before the release pull request merges, since CI cannot publish a new package's
   first version (packages/README.md):
   `pnpm exec package-checks stage packages/profiles/system-cleanup packages/corpora/system-cleanup-reference`.
4. Add a changeset for each, and update the "not published yet" lines in both READMEs and in
   packages/README.md.

Before this can be done:

- Undecided (owner, 2026-11-21): whether the reference is published at all, or only the profile,
  with the records shipped in compiled form instead, as harness-reference ships through
  `@osdlc/harness-knowledge`.
