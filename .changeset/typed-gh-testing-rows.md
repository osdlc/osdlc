---
"@osdlc/typed-gh": minor
---

New `@osdlc/typed-gh/testing` entry point with builders for faking `gh` in tests. `prRow`, `issueRow`, `repoRow`, `searchPrRow`, `labelRow`, `checkRunRow`, `statusContextRow`, `commentRow` and `reviewRow` return gh's raw `--json` rows, with defaults that fill every field the parsers require (a pull request's `number`, a repository's `nameWithOwner`, the `headRefName` that `prList({ head })` filters on), and take typed overrides merged shallowly. `ghResult(payload)` wraps rows in a successful `CommandResult` for a fake runner. The main entry point does not import it.
