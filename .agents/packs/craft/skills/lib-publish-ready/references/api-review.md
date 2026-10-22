# API review

How the audit builds the API inventory, and how the owner reviews it in the `api-review` step
of [process](process.md). The ecosystem file says where the public API is
([rust](rust.md), [npm](npm.md)).

## Inventory

One line per public item, in the report's API section:

| Column | Holds |
|---|---|
| Item | The exported name. |
| What it does | One plain line, from the source. See [Review surface](#review-surface). |
| Entry point | The entry or subpath that exposes it. |
| Signature | Its type or signature, as a consumer sees it. |
| Tier | `stable` or `experimental`, as its docs declare it. |
| Documented | Whether it has docs. |
| Tested | Whether a test reaches it. |
| Example | The example file that uses it, or none. |
| Flags | The flags below that apply. |

## Flags

- `internal`: it looks like a helper the package uses itself, not something a consumer needs.
- `name`: the name is awkward, unclear, or breaks the package's naming pattern.
- `signature`: it takes or returns things in a different shape from its siblings.
- `experimental`: it is new or still changing; mark it experimental or drop it before release.
- `undocumented`, `doc-gap` or `untested`: no doc comment, a thin or wrong one, or no test
  reaches it.
- `no-example`: a stable item with no example. It is also a fix item under row Q8.
- `breaking`: the [version replay](version-replay.md) has a breaking change to it; name the
  change.

Each flagged item gets an owner question: keep, rename, hide or mark experimental. Items that
share a flag and a reason share one question, which names each item.

## Examples

Usage examples are part of the API. Every stable public item has at least one before the API
gate can pass.

- Examples are runnable source files, not code blocks in prose.
- They import the package by its name only, never a source path.
- The test suite type-checks and runs them.
- The README and docs take their snippets from those files.
- The ecosystem file says where they live and how they run.

## Review surface

Present the inventory to the owner as one page, for example a `$craft:parley` document with id
`<package>-api-review`, saved as `<id>.json`. Hang each API owner question and the sign-off
question on that page. Check the page with `parley check` before you hand it over.

Each API block on the page must make sense to a reader who does not remember the library, and
must show what the source says. The doc comment and signature are verbatim. "What it does" is
the reviewer's plain summary.

1. Start with 1 to 3 plain sentences on what the module or group is for and when a caller uses
   it. Add a concrete example where it helps.
2. Then one entry per exported function and type, grouped by source file. A class, interface or
   struct gets one entry. Its members appear inside that entry, not as entries of their own.
   Each entry has the parts under [Entry parts](#entry-parts), in that order.
3. Take every claim from the source, never from the item's name. Read the code.
4. Put review notes, such as flags and caveats, after the parts.

In `$craft:parley`, use one `annotated-text` block per source file or group. The block text holds
the doc comments and signatures. Each item is one step:

| Step field | Holds |
|---|---|
| `anchor` | The item's signature line, as a `TextQuoteSelector`. |
| `summary` | The "What it does" line. |
| `detail` | The example and any longer notes. |
| `warnings` | The gaps: no doc comment, a thin or wrong one. |
| `source` | The item's `uri` and `range`. See Links. |

### Entry parts

| Part | Holds |
|---|---|
| Doc comment | The item's own doc comment, copied from the source. It sits above the signature, as in the source. See below. |
| Signature | The item's signature as a consumer sees it. |
| What it does | The reviewer's plain line, from the source. It sits apart from the doc comment and is never presented as the library's words. |
| Links | A link to the definition in the repo viewer, and one on the code host when the commit is pushed. See below. |
| Example | A short example. Use the example file when the item has one. Otherwise see below. |

**Doc comment.** Copy it from the source file at the audited commit, unedited and with its
markers (`/** */`, `///`, `//!`). Do not shorten, reword or correct it. The reader has to see it
as the consumer sees it.

**No doc comment.** Show the gap in the comment's place with the exact string `NO DOC COMMENT`,
and set the `undocumented` flag. For a class, interface or struct, copy the comments its members
have and mark the members that have none. Do not write a substitute comment. The plain line goes
under What it does. In `$craft:parley`, also put the gap in the step's `warnings`.

**Thin or wrong doc comment.** Still copy it unedited. Set the `doc-gap` flag, say in the entry
what is missing or wrong, and put it in the step's `warnings`.

**Links.** Link the lines from the start of the doc comment, or of the signature when there is
none, to the end of the item, at the audited commit. In `$craft:parley` set the step's `source` with
`uri` and `range`, and the document `repo` with the remote and the commit, so the page shows the
file-viewer link and, when the repo is set, the GitHub link. The `range` counts lines from 0 and
its end is exclusive: lines 25 to 62 are start line 24 and end line 62, character 0 on both.
Give the GitHub link, `https://github.com/<owner>/<repo>/blob/<commit>/<path>#L<start>-L<end>`,
only when the audited commit is pushed. Otherwise omit it and keep the local source link. When
the package already sits in its home repo on a branch, add a link there too.

**Examples.** A written example does not satisfy row Q8, which needs runnable example files that
the test suite runs. An item with no example file keeps the `no-example` flag. Write an example
only for an item with no example file. Write and run it outside the audited package, for
example in a scratch directory that imports the packed build. On the page, mark it as written
for the review with a `// Example:` line, and show its checked output.

## Twin parity

Row Q24 of the [quality bar](quality-bar.md).

A twin is a separate implementation of the same behaviour in another language. A package built
from the other's source, such as a wasm binding, is a binding, not a twin: it has one
implementation, and Q24 is n/a.

Find the twin:

1. Read the package's README and manifest description for "twin", "port" or "peer of".
2. Look for the same name in the other language's package folders, and for a name with the
   other ecosystem's scope.
3. The owner's library roster, if the project keeps one.
4. No twin found in these places: Q24 is n/a, and the Rows evidence says where you looked.

Check the twin:

1. Behaviour changes: take the commits in the replay that changed behaviour, and for each find
   the twin's commit. It should be in the same PR or, for a twin in another repo, in a linked PR
   there, released together. If not, the PR text or the CHANGELOG says why.
2. Data-driven behaviour: find the fixture (a conformance or case file). Both test suites must
   read the same file, or a copy pinned to a named twin version that a test or CI job checks
   against that version. Two hand-kept copies of the cases fail the row.
3. Versions: unequal major.minor between the twins is a gap. The rule and the patch handling
   are in [version-replay](version-replay.md#twins). The aligned twin's CHANGELOG line is in
   [changelog](changelog.md).
4. Each CHANGELOG names the twin version it matches, in the entry for the version.

A deterministic gate may automate this check.
