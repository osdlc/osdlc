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
- `undocumented` or `untested`: no docs, or no test reaches it.
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
question on that page.

Each API block on the page must make sense to a reader who does not remember the library:

1. Start with 1 to 3 plain sentences on what the module or group is for and when a caller uses
   it. Add a concrete example where it helps.
2. Then one plain line per public item saying what it does.
3. Take every claim from the source, never from the item's name. Read the code.
4. Put review notes, such as flags and caveats, after that.

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
