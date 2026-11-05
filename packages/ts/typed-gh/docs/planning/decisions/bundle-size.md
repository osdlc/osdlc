---
type: decision
state: accepted
created: 2026-11-05
---

# Bundle size: small tools use verb functions, not `Gh`

## Decision

- A tool that bundles its code and makes a few `gh` calls imports the verbs
  it calls and runs them with `runVerb` or `runVerbAsync`, through a runner
  from `defaultRunnerFactory` or `@osdlc/command-seam`. It does not
  construct a `Gh` or an `AsyncGh`. The README says so.
- `Gh` stays one class with every method. It is not split into a small core
  and entry points for verb groups (search, repositories, GraphQL).
- `raw(argv)` and `rawChecked(argv)` are verbs, the function form of
  `Gh.raw` and `Gh.rawChecked`. `raw` is a `probe`, so `runVerb` returns its
  result whatever the exit code. `rawChecked` is `checked`, so `runVerb`
  throws the classified `GhFailure` unless gh exits 0 with its whole output.
  Neither is `readOnly`, since the library cannot judge an argv. Both clients'
  `raw` and `rawChecked` methods run these verbs, so the two forms cannot
  drift apart. `runCheckedGh` stays internal.
- `tests/bundle.test.ts` bundles the verb path with tree-shaking and fails if
  it carries a client or a verb it does not call.

## Why

A bundler drops an unused function but not an unused method. Constructing one
`Gh` keeps every method, so it keeps every verb and parser those methods call.
In 0.6.0 that grew sksizer/dev's diffkit bundle by 3.7% (395 KB to 410 KB).
diffkit calls only `prDiff` and `rawChecked`.

diffkit lives in another repository, so its bundle was not rebuilt here. A
proxy entry makes the same two calls (`prDiff(n)`, then a raw checked
`gh api` call), built with `bun build --minify --target=node` (bun 1.4.4),
against 0.15.0 with the `raw` and `rawChecked` verbs added:

| Entry                                   | Bytes  | Gzip   |
| --------------------------------------- | ------ | ------ |
| The runner alone, no typed-gh (a floor) | 7,627  | 3,236  |
| `Gh`                                    | 67,965 | 21,637 |
| `Gh` split (estimated)                  | 63,804 | 20,488 |
| Verb functions and `runVerb`            | 14,353 | 5,838  |

- "The runner alone" is command-seam's `spawnRunner` running `gh pr diff`.
- "`Gh`" is `new Gh(cwd)`, then `gh.prDiff(n)` and `gh.rawChecked(argv)`.
- "`Gh` split" is the same through a copy of `sync.ts` without `searchPrs`,
  `repoList`, `repoView` and `graphql`, the groups a split would move out.
- "Verb functions" is `runVerb(prDiff(n), runner, opts)` and
  `runVerb(rawChecked(argv), runner, opts)`, with
  `runner = defaultRunnerFactory('gh')`, and no `Gh`.

What the numbers say:

- The verb path is 53.6 KB smaller than `Gh` for diffkit's two calls: 79%, or
  89% once the runner both carry is taken out. That is more than the 15 KB
  that 0.6.0 added. On a 410 KB bundle it is about 13%, so diffkit should come
  in near 356 KB, below its 395 KB baseline. diffkit's own build may minify
  differently, so this is an estimate until diffkit is rebuilt.
- What the verb path keeps beyond the runner is the verbs it calls, `runVerb`,
  and the failure classifier (`classifyGhFailure`, with command-seam's
  `classifyFailed`), which every checked call needs to throw a `GhFailure`.
- Splitting `Gh` saves 4.2 KB (6%) for diffkit. A core `Gh` still holds every
  pull request, issue and label method, the `try` and `soft` proxies and the
  merge-state retry. A split small enough to matter would be a split per verb,
  which is the verb functions again.
- A split changes the public API: methods move off `Gh`, and every caller of
  them changes its imports. Documenting the verb path breaks no caller: the
  verb functions and `runVerb` already exist, are stable, and run a verb as
  `Gh` does.
- `rawChecked` as a verb, rather than `runCheckedGh` exported, keeps one way
  to run a call outside a client: build a verb, then `runVerb` it. The async
  form comes free through `runVerbAsync`, with its `signal`.

## Consequences

- A small tool gives up `try`, `soft` and the helpers built on several calls
  (`prFind`, `openPrFor`, `prViewSettled`). It catches the `FailureError`, or
  builds what it needs from verbs: `pickPrForBranch` over the result of
  `openPrsForBranch` is `openPrFor`'s answer.
- The rule that a verb which is not `readOnly` is `checked` has one exception
  now, `raw`, and the test of that rule names it.
- A large tool that already constructs `Gh` is unaffected. 0.6.0 grew such
  bundles by about 0.2%.
- The bundle test uses `rolldown`, a dev dependency, as wayfinder's web-bundle
  test does.
