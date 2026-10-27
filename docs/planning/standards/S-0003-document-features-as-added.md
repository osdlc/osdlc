# S-0003: Document a feature when it is added

## Purpose

A library's users learn it from its own docs. A feature that ships without
docs can only be found by reading the source, and docs written later are
written by someone who has to rediscover how it works. This standard says
where a library documents each feature, and that the change adding the
feature also documents it.

## Rule

- **Same change.** A change that adds or changes something a library's users
  can use (an export, a CLI command or flag, a bin, a config key, an output
  format) documents it in that library, in the same pull request.
- **README: what it is and the shortest example.** The library's `README.md`
  names the feature, says in a sentence or two what it is for, and shows the
  smallest working use. The README links to the guide page when there is one.
- **`docs/guide/`: the longer how-to.** When using the feature takes more than
  a README example (setup steps, its options, how it combines with other
  features, the mistakes to avoid), that goes in a page under the library's
  `docs/guide/`. The site publishes those pages under the library's page.
- **`docs/reference/`: the exact facts.** A library with enough of them (every
  flag, config key or error code) lists them under `docs/reference/`, as
  [doc-locations](../../../standards/doc-locations.md) describes.
- **A change updates what it changes.** Changing or removing a feature updates
  or removes the README text, guide pages and examples that describe it, so
  no example shows behaviour the library no longer has.
- **Internal changes need no docs.** A refactor, a fix that restores
  documented behaviour, or a change to private code with no effect a user can
  see adds no docs.

## Enforcement

No script. Review checks it: a pull request that adds or changes a feature
without the docs above is not ready to merge. A changeset is a useful prompt:
a `minor` or `major` bump usually means a feature changed, so check that the
package's README or `docs/guide/` changed with it.
