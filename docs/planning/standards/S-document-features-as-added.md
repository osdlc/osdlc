# S-document-features-as-added: Document a feature when it is added

## Purpose

A library's users learn it from its own docs. A feature that ships without
docs can only be found by reading the source, and docs written later are
written by someone who has to rediscover how it works. This standard says
where a library documents each feature.

## Rule

- **Same change.** [doc-locations](../../../standards/doc-locations.md)
  Rule 2, "Docs change with the code", applies to every change that adds,
  changes or removes something a library's users can use: an export, a CLI
  command or flag, a bin, a config key, an output format. The docs below
  change in that library, in the same pull request, and no README text,
  guide page or example is left describing behaviour the library no longer
  has.
- **README: what it is and the shortest example.** The library's `README.md`
  names the feature, says in a sentence or two what it is for, and shows the
  smallest working use. The README links to the guide page when there is one.
- **`docs/guide/`: the longer how-to and the full list.** When using the
  feature takes more than a README example (setup steps, every option or flag,
  how it combines with other features, the mistakes to avoid), that goes in a
  page under the library's `docs/guide/`. The site publishes those pages: in
  the library's sidebar group, or in its own section for an app such as
  `wayfinder`. A TypeScript library has no `docs/reference/`;
  [S-package-shape-ts](./S-package-shape-ts.md) allows only `docs/planning/` and
  `docs/guide/`.
- **Internal changes need no docs.** A refactor, a fix that restores
  documented behaviour, or a change to private code with no effect a user can
  see adds no docs.

## Enforcement

No script. Review checks it: a pull request that adds or changes a feature
without the docs above is not ready to merge. A changeset is a useful prompt:
a `minor` or `major` bump usually means a feature changed, so check that the
package's README or `docs/guide/` changed with it.
