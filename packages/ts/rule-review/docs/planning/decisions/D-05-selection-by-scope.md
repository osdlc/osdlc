---
id: D-05
type: decision
state: accepted
created: 2026-11-07
---

# D-05: Selection by scope intersection

## Decision

- A rule source is judged only when one of its glob patterns matches a changed
  file. Matching is `@osdlc/intersect`, with dot paths matched, so `**` covers
  `.github/` and `.env`.
- Rule sources and check scripts use the same matcher.
- A changed path is matched literally, so `pages/[id].vue` is a name, not a
  character class. A pattern the matcher cannot read stops the run with a
  `ScopeError` that names it.
- One judgement per source, over only the files it governs. A source that
  governs more than `maxFilesPerJob` files (12) is split into shards of even
  size, judged at the same time against the same rules.

## Example

Four rule sources against a change to four files. `planJobs` makes the same
selection a run makes, without git or an agent:

```ts
import { DEFAULT_CONFIG, planJobs } from '@osdlc/rule-review'

// source(id, patterns) builds a RuleSource with those patterns.

const { jobs, skipped } = planJobs(
  [
    source('CLAUDE.md', ['**']),
    source('apps/web/CLAUDE.md', ['apps/web/**']),
    source('docs/STYLE.md', ['**/*.md']),
    source('db-rules', ['migrations/**']),
  ],
  ['apps/web/src/page.tsx', 'README.md', '.github/workflows/ci.yml', 'pages/[id].vue'],
  DEFAULT_CONFIG,
)
```

| Source | Judged against |
| --- | --- |
| `CLAUDE.md` (`**`) | all four files: `**` covers `.github/`, and `pages/[id].vue` is matched as a name |
| `apps/web/CLAUDE.md` (`apps/web/**`) | `apps/web/src/page.tsx` |
| `docs/STYLE.md` (`**/*.md`) | `README.md` |
| `db-rules` (`migrations/**`) | nothing: it is in `skipped`, and costs no model call |

## Why

- A rule file the change does not touch is dropped without a model call, so a
  run costs what the change touches, not what the repository holds.
- A judge given one rule file and a dozen diffs reasons better about each than
  one given sixty. Measured on a 63-file branch: 30 shards at a cap of 32 took
  155 s, against 190 s unsharded; sharding under a cap below the job count was
  slower than not sharding.
- A rule that says it covers the repository should cover its dot paths; not
  matching them was a silent miss.

## Consequences

- `concurrency` defaults to 32 so a sharded branch is one wave.
- A finding that cites a file outside its source's scope is dropped.
