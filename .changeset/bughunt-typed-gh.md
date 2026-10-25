---
'@osdlc/typed-gh': minor
---

Behaviour change: output that the runner cut short (`outputIncomplete`, at the output cap or a timeout) now fails as `CommandFailed` for every verb but a probe, and in `runCheckedGh`/`runCheckedGhAsync`, instead of being parsed as whole. Behaviour change: every `AsyncGh` method that builds a verb now rejects its Promise on a bad argument (a verb's `RangeError`) instead of throwing at the call site.
`parseOwnerRepo` now reads a GitHub Enterprise remote (a host `parseGitUrl` does not know) through `parseRemoteUrl` instead of answering null. `graphql` refuses a document holding a mutation or subscription anywhere (after a fragment, a leading `,`, or a second operation), and a variable named `query` or `operationName`. `prView` passes a scheme-less PR URL (`github.com/o/r/pull/7`) to gh with `https://`, so gh no longer takes it for a branch name. `repoView` treats a hostname of `''` as not set. `createLabel` and `editLabel` refuse a name that starts with `-`. `openPrFor` takes `timeoutMs`.
