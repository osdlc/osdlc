---
id: D-09
type: decision
state: accepted
created: 2026-11-07
---

# D-09: The API for 0.4.0

## Decision

- 0.4.0 ships the exports the README's API section lists, from one entry
  point, and the `rule-review` command with `checks` and `dev`.
- `reviewChanges` is the front door: one call from a checkout to a run.
  `review` is the same run with its inputs supplied. The names follow the
  package: `reviewChanges`, `ReviewChangesOptions`, `ReviewChangesResult`,
  `review`, `ReviewOptions`, `ReviewConfig`, `ReviewJob`, `ReviewRun`.
- The changeset readers take a directory path or a `Git`, so a caller needs
  no typed-git of its own.
- `DEFAULT_CONFIG`, `FINDINGS_SCHEMA` and `SEVERITY_ORDER` are frozen.
- `AgentCallSpec` and `AgentResult` are re-exported for a custom `Dispatch`.
- The matcher, the reply parsers, the token divisor, the default file lister
  and the check-name parsers are not exported.
- The check-folder runner is experimental ([D-02](D-02-version-line-and-stability.md)).

## Example

The front door, from a checkout to a run in one call:

```ts
import { reviewChanges } from '@osdlc/rule-review'

const run = await reviewChanges({ base: 'main', config: { engine: 'claude', effort: 'high' } })
for (const f of run.findings) console.log(f.severity, f.file, f.why)
```

The same run with every input supplied, for a change that does not come from a
checkout, or to choose settings per judgement:

```ts
import {
  changedFiles,
  DEFAULT_CONFIG,
  discoverSources,
  fileDiffs,
  instructionFiles,
  review,
} from '@osdlc/rule-review'

const files = changedFiles(root, 'main')
const run = await review({
  projectRoot: root,
  sources: await discoverSources([instructionFiles()], { projectRoot: root, changedFiles: files }),
  changedFiles: files,
  diffs: fileDiffs(root, 'main', files),
  config: DEFAULT_CONFIG,
  // More reasoning for the security rules, the defaults for the rest.
  configFor: (job) =>
    job.source.path === 'security/AGENTS.md' ? { ...DEFAULT_CONFIG, effort: 'high' } : DEFAULT_CONFIG,
})
```

The shared defaults are frozen, so a change is a copy:

```ts
const config = { ...DEFAULT_CONFIG, blocking: true } // fine
DEFAULT_CONFIG.exclude.push('dist/**') // throws: the array is frozen too
```

## Why

- A caller should not need six imports and two other packages to review a
  branch. The lower-level pieces stay for callers with their own changeset or
  rule corpus.
- Everything exported is a promise. What only the package itself uses stays
  private, so it can change in a patch release.
- A shared default that any caller can mutate changes every later run in the
  process.

## Consequences

- Each stable export has an example under `examples/` that the test suite runs
  through the package name.
- Exporting another item later is a minor release; removing one is breaking.
