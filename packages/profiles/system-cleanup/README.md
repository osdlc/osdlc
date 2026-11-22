# @osdlc/corpus-profile-system-cleanup

The system cleanup profile is a set of corpus-schema record types for a cited record of where tools and
apps keep data that can be reclaimed from disk, and how to reclaim it safely. It builds on the
[claims profile](../claims/README.md): every answer
is a statement with evidence lines, and every piece of evidence is a study result that quotes a
page. [The system cleanup reference](../../corpora/system-cleanup-reference/) is the corpus that uses it.

The profile holds types and no records. It is not published yet; [B-0001](../../corpora/system-cleanup-reference/docs/planning/backlog/B-0001-publish-the-system-cleanup-profile-and-reference.md) tracks its release.

## Use it

```yaml
---
corpus-schema: 0
level: 2
extends:
  system-cleanup: "@osdlc/corpus-profile-system-cleanup"
uses: [system-cleanup/*]
---
```

Once it is published, install the profile and the claims profile beside your corpus. The validator finds both the way
Node.js finds packages, and `extends` needs `@osdlc/corpus-schema` 0.4.0 or later.

## The types

| Folder | Builds on | Holds |
| --- | --- | --- |
| `stores` | (its own) | A tool or app that fills a disk: its slug, category, vendor, platforms and sources. `system: true` marks data that needs root to clean. |
| `subjects` | (its own) | A question asked of every store, with a `valueSchema` for the answer and `applies_to` for the store categories it is asked of. |
| `statements` | `claims/statements` | A claim, plus `store`, `subject`, `scope` (`since`, `until`, `platform`), `status`, `open` and `supersedes`. |
| `study-results` | `claims/study-results` | An observation, plus `kind`, `store`, `observed`, `locator`, `version` and `excerpt` (a W3C TextQuoteSelector). A page kind needs `reportedIn` and `excerpt`. |
| `documents` | `claims/documents` | A page, as the claims profile has it. |
| `methods` | `claims/methods` | A repeatable run, as the claims profile has it. |

Each type's schema is in its folder, such as `corpus/stores/stores.schema.md`; its frontmatter is
the JSON Schema and its body explains the fields.

The statement and study-result types follow the harness reference
([`packages/corpora/harness-reference`](../../corpora/harness-reference/)): the same strength rule (source or help text strong, vendor
docs moderate, an issue or a third-party page weak) and the same spelling of paths (a tilde for the
home folder, no trailing slash, `$VAR` only where the tool names it).
