---
id: D-06
type: decision
state: accepted
created: 2026-11-07
---

# D-06: Advisory by default; an incomplete run fails only with `--strict`

## Decision

- Findings are reported and exit 0 unless `--blocking` is set. With it, a
  finding at or above the severity floor (`violation` by default) exits 1.
- A judgement that fails (no agent, no key, a timeout, a reply that is not a
  findings object) marks the run incomplete (`degraded`). It never reads as
  clean, and it does not fail the run unless `--strict` is set, which exits 11.
- An unknown engine name is refused before any agent starts.

## Example

```sh
rule-review --base main                                # findings printed, exit 0
rule-review --base main --blocking                     # exit 1 on a violation
rule-review --base main --blocking --severity tension  # exit 1 on a tension or worse
rule-review --base main --blocking --strict            # and exit 11 if a judgement failed
```

The library returns the run and leaves the verdict to the caller.
`exitCodeFor` gives the command's answer for a set of findings:

```ts
import { DEFAULT_CONFIG, exitCodeFor, reviewChanges } from '@osdlc/rule-review'

const run = await reviewChanges({ base: 'main', config: { blocking: true } })
if (run.degraded) console.error('Some rule files could not be judged.')
process.exitCode = exitCodeFor(run.findings, run.config) // 1 on a violation, else 0

exitCodeFor(run.findings, DEFAULT_CONFIG) // always 0: advisory
```

## Why

- An agent's judgement is not deterministic. A team should see the findings
  before it lets them block a merge.
- An agent that could not be reached is not evidence of a violation, so a
  hook on a laptop with no key should not block a push. In CI the same gap
  would pass every change, so CI turns on `--strict`.

## Consequences

- The CI examples use `--blocking --strict`. The hook examples use
  `--blocking` or nothing.
