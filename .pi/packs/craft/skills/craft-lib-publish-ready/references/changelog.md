# Changelog draft

How the audit drafts the CHANGELOG the first public version ships with. It writes the draft as
`CHANGELOG.draft.md` beside the report, never inside the package. The `fixes` step in
[process](process.md) puts it in place, as Release tools below says.

## Modes

`--changelog` picks the mode. The default is `replay`.

| Mode | Draft |
|---|---|
| `replay` | One entry per replayed version, built from the [version replay](version-replay.md) table. |
| `keep` | The existing CHANGELOG, sanitized. |
| `summary` | One entry for the first public version that says what the library does. |
| `none` | An empty Unreleased section. |

Every mode except `none` is sanitized and checked, as below.

## Layout

The draft follows Keep a Changelog. Newest first.

```markdown
# Changelog

## [Unreleased]

First public release. <One or two sentences on what the library does.>

### Added
### Changed
### Removed
### Fixed

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.5.3] - 2026-10-14 (unpublished)

### [0.5.2] - 2026-10-06 (unpublished)
```

- The first public version's entry sits under `## [Unreleased]`, with the rows after the cut.
  The release commit dates it, as Release entry below says. In release mode the draft already
  carries that dated heading.
- In `replay` mode, history versions use `###` headings, dated by their last row that bumped.
  Their groups use `####`. They carry `(unpublished)` and no compare links.
- The chosen version decides where the last replayed version goes:
  - Equal: its changes go in the Unreleased entry, and the history starts one version lower.
  - Higher: every replayed version goes in the history. The Unreleased entry gets an
    `### Added` summary of the public items, traced to the replay rows that added them, and the
    rows after the cut.
  - Lower (`reset`, or `current` below the replay): the history would reuse version numbers that
    a later public release needs. Write the draft as `summary` instead, and say so in the report.
- Leave out any empty group.
- When Q24 applies, the release entry names the twin and the twin version it matches.
- A twin released only to match the other's major.minor has no changes of its own. Its entry is
  one line under `### Changed`: `Aligned with <twin> <version>.` A twin with its own changes
  also ends its entry with that line when its major.minor was raised to match. That line meets
  the rule above, so the entry names the twin once.

## Building a `replay` entry

- Each feature row that adds an item is Added. A breaking row is Changed or Removed, and its
  line starts with `Breaking:`. Other feature rows are Changed. A fix row is Fixed. A `none` row
  gives no entry.
- Write each line for a consumer: what changed in the public API or its behaviour, and what a
  caller must do for a breaking change.
- Small fix rows in one version may share a line.
- Version numbers follow the replay, not the old file. The replay has already checked the old
  file's entries.

## Release tools

- Hand-edited CHANGELOG: `fixes` replaces the file with the draft.
- Changesets: the home's tool writes `version` and `CHANGELOG.md`, so neither is edited by hand.
  The Unreleased text becomes the changeset summary. The history section goes into
  `CHANGELOG.md` once, below where Changesets writes.
- release-plz: the same as Changesets. The Unreleased text becomes the release notes input, and
  the history section goes in once, below where release-plz writes.

## Release entry

This is how bar row Q19 is graded, on the file as it is.

- The CHANGELOG follows Keep a Changelog, or the form the home's release tool writes.
- A version heading is dated in the change that is tagged, not after the tag.
- pass: the changes for the coming release sit under Unreleased, or in pending changesets, and
  every version heading has a release tag.
- Release mode, when the audited ref is the release commit for version X: a dated heading for X
  with no tag yet passes.
- Otherwise a dated heading with no tag is a gap.
- Changesets headings (`## X.Y.Z`, no brackets, no date) are accepted; the tag check is the
  whole test.
- The `History before the first public release` section is exempt: its versions were never
  published.

## Sanitization

- **No private code.** No snippets or identifiers from code outside the public API. No internal
  file paths, private repo names or URLs, or internal ticket, task or decision ids. No links to
  private PRs or issues. Check the source repo's visibility, for example with
  `gh repo view <owner>/<repo> --json visibility`. A link to the package's public home is fine.
- **No personal mentions.** No people's names, handles or email addresses. No machine names or
  home directory paths.
- **Nothing inappropriate.** No profanity, blame, jokes at someone's expense, or internal-only
  commentary. Describe each change neutrally, from a consumer's view.
- **Accurate.** Every entry traces to a row in the replay table, or, in `keep` mode, to a commit.
  The `summary` description is the one exception. Nothing is invented. An entry the audit could
  not verify is left out and listed in the report.

## Mechanical check

After the draft is written, grep it for each pattern below, with word boundaries
(`grep -nwE`). Fix every hit, or record it as allowed with its reason. Record the patterns, the
fixed count and the allowed hits in the report. This is the same check as quality bar row Q15
Independence, run on the draft.

- The source repo's name, its `owner/repo` form, and the names of its apps and tools.
- The internal id patterns the source repo uses for tickets, tasks and decisions.
- Paths outside the package, and home directory paths (`/Users/`, `/home/`).
- `@`-handles that are not followed by `/` (so not a scoped package), and email addresses.
- The names in `git log --format='%an%n%cn'` for the package's history.
- Links into the source repo, when it is private: `github.com/<owner>/<repo>` and `#<number>`
  references that resolve there.

Allowed hits: the package's own name, the names of its published dependencies, and links to
its public home. A short repo name that is also an ordinary word is checked by reading each hit.
