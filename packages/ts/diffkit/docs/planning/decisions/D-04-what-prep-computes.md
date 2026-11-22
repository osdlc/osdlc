---
id: D-04
type: decision
state: accepted
created: 2026-11-22
---

# D-04: What `prep` computes and what it leaves to a reviewer

## Decision

- `prep` is deterministic. The same change in the same checkout gives the same manifest. It
  calls no model, writes nothing, creates no worktree and keeps no state.
- It classifies nothing itself. Every file fact, the group, the change category and the language,
  comes from `@osdlc/code-stats`, so `diffkit prep` and `code-stats diff` agree on what a
  generated file or a formatting-only change is.
- What it computes on top of those facts:
  - which files to drop, and why: generated, vendored or formatting-only;
  - groups of the kept files by nearest package root, split and packed to a size;
  - reading-order flags.
- What it leaves to a reviewer: whether a change is correct. A flag is not a finding. A file with
  no flag has not been shown to be fine. A language with no flag checks is listed as not covered
  in `coverage`, which is not the same as clean.
- Added, deleted and renamed files are always kept. A file whose changed lines are all comments is
  kept, with `category: "comments"`, because the accuracy of comments is reviewed. A reformatted
  test or doc file is kept.
- A flag has a `basis`. `measured` is a count taken from the diff and the syntax tree.
  `heuristic` is a pattern that is often right and sometimes not, and its measurements are the
  evidence to check.

## Why

- A reviewer, human or automated, needs a plan it can trust to be repeatable. A model in the
  planning step would make the plan vary between runs and cost money.
- One source for file facts avoids two tools disagreeing about the same file.

## Consequences

- A repository marks its own generated trees in `.gitattributes`, as GitHub reads them. Prep has
  no list of its own to configure.
- The flags need the `typescript` compiler API. Without it they are skipped and `notes` says so.
