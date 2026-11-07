---
'@osdlc/typed-gh': minor
---

`prActivity` (experimental): a pull request's comments, reviews and their inline comments, commits, force pushes and changes of state as one list in timeline order, through GraphQL `timelineItems`, with every page read. Pass `since` (an ISO 8601 date and time) to read only what GitHub dates from then on. It is a verb, a method on `Gh` and `AsyncGh`, and has a `soft` form. It returns `null` for a pull request that does not exist, and `truncated: true` when a review has more than 100 inline comments. New types: `PrActivityItem`, `PrActivityKind` and `PrActivityOptions`.
