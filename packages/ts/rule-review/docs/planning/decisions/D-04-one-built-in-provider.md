---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: One built-in rule provider

## Decision

- The package ships one rule-source provider, `instructionFiles()`, for
  `CLAUDE.md` and `AGENTS.md`. A `CLAUDE.md` or `AGENTS.md` at directory `D`
  governs `D/**`.
- Every other corpus (a standards folder, a style guide) is a
  `RuleSourceProvider` that its owner writes and passes in. The command line
  uses only the built-in provider.
- Nothing downstream of a provider knows where a rule came from: selection,
  judgement and reporting see only a `RuleSource`.

## Example

The built-in provider is the default. A corpus of your own is a provider you
pass beside it; here, a style guide that governs every Markdown file:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { instructionFiles, reviewChanges, type RuleSourceProvider } from '@osdlc/rule-review'

const styleGuide: RuleSourceProvider = {
  id: 'style-guide',
  async discover({ projectRoot }) {
    return [
      {
        id: 'style:docs/STYLE.md',
        kind: 'style',
        path: 'docs/STYLE.md',
        depth: 0,
        patterns: ['**/*.md'],
        text: readFileSync(join(projectRoot, 'docs/STYLE.md'), 'utf8'),
        label: 'Style guide (Markdown files)',
      },
    ]
  },
}

await reviewChanges({ base: 'main' }) // CLAUDE.md and AGENTS.md only
await reviewChanges({ base: 'main', providers: [instructionFiles(), styleGuide] })
```

The full example is `examples/custom-provider.ts`.

## Why

- Every repository that keeps agent rules has instruction files, and their
  scope is fixed by where they sit. Any other corpus has its own format and its
  own scoping, which only its owner knows.
- A provider for one corpus inside this package would tie it to that corpus.

## Consequences

- A consumer with its own corpus calls `reviewChanges` or `review` with its
  provider; the command does not load plugins.
- `@path` imports are inlined the way Claude Code reads them, two levels deep,
  and only from inside the repository. A `[[wikilink]]` is not followed.
