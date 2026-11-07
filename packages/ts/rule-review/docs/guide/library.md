---
title: Using the library
sidebar:
  order: 4
description: Review from your own code, add your own rule sources, and test without an agent.
---

Everything the command does is a library call. Each example on this page is
taken from a file under [examples/](../../examples) that the test suite runs.

## One call: `reviewChanges`

```ts
import { reviewChanges } from '@osdlc/rule-review'

const run = await reviewChanges({ base: 'main' })

for (const f of run.findings) {
  const where = f.line === undefined ? f.file : `${f.file}:${f.line}`
  console.log(`${f.severity} ${where} (${f.sourcePath}): ${f.why}`)
}
if (run.degraded) console.error('Some rule files could not be judged.')
```

Every option is optional:

| Option | Default | Meaning |
| --- | --- | --- |
| `cwd` | `process.cwd()` | Any directory inside the checkout. |
| `base` | `'HEAD'` | What to compare against, as with `--base`. |
| `providers` | `[instructionFiles()]` | Where rule sources come from. |
| `config` | `DEFAULT_CONFIG` | Only the settings to change, e.g. `{ blocking: true, concurrency: 8 }`. |
| `dryRun` | `false` | Plan and measure; start no agent. |
| `signal` | none | Abort to kill every running agent. |
| `onJobSettled` | none | Called as each judgement finishes, for progress. |
| `dispatch` | the real agent call | Replace the agent, for tests. |

The result is the run plus the changeset it judged:

| Field | Holds |
| --- | --- |
| `findings` | Every finding, repository-wide rules first, worst first under each. |
| `jobs`, `outcomes` | One per judgement: its rule source and files, then its findings, error, duration, cost and prompt size. |
| `skipped` | Rule sources that governed no changed file. |
| `degraded` | `true` when any judgement failed. |
| `changedFiles`, `base`, `resolvedBase`, `projectRoot`, `config` | What was judged, and how. |

It throws `ChangesetError` when it cannot start (`kind` is `not-a-repository`
or `bad-base`), `ScopeError` for a glob it cannot read, and an `Error` naming
the setting when one is out of range (an unknown engine, a zero concurrency).
No agent has started when any of these is thrown.

## Your own rules: a provider

`CLAUDE.md` and `AGENTS.md` come from the built-in `instructionFiles()`
provider. Rules kept anywhere else (a style guide, a standards folder, a
database) come from a provider you write. A provider returns rule sources: an
id, the rule text, and the glob patterns it governs.

```ts
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

const run = await reviewChanges({ base: 'main', providers: [instructionFiles(), styleGuide] })
```

| Field | Meaning |
| --- | --- |
| `id` | Unique in the run. Two providers claiming one id is an error. |
| `kind` | Your label for the provider; it is copied onto each finding. |
| `path` | The file the rules came from, for reports. |
| `depth` | How specific the scope is. Lower is broader; reports list broad rules first. |
| `patterns` | Globs for the files it governs. `**` is every file, dot paths included. |
| `text` | The rules, handed to the agent word for word. |
| `label` | How reports name it. |

`discover` gets `{ projectRoot, changedFiles }`. It may use the changed files
to avoid reading sources that cannot apply, but it does not have to: a source
whose patterns match no changed file is dropped either way.

## The pieces: `review` and friends

`review` is the same run with every input supplied by you: the sources, the
changed files and their diffs. Use it when the change does not come from a git
checkout, or to choose settings per judgement with `configFor`:

```ts
const run = await review({
  projectRoot,
  sources,
  changedFiles,
  diffs,
  config: DEFAULT_CONFIG,
  // More reasoning for the security rules, the defaults for the rest.
  configFor: (job) =>
    job.source.path === 'security/AGENTS.md' ? { ...DEFAULT_CONFIG, effort: 'high' } : DEFAULT_CONFIG,
})
```

The changeset readers take a directory or a typed-git `Git`:

```ts
const files = changedFiles(root, 'main') // ['src/a.ts', 'src/new.ts']
const diffs = fileDiffs(root, 'main', files)
const base = defaultBase(root) // origin/HEAD, else main (or master)
```

`planJobs` shows what a run would judge without git or an agent, and
`exitCodeFor` turns findings into the command's exit code.

## Testing without an agent

Pass `dispatch` to replace the agent call. It gets the call that would have
been made and returns the agent's answer:

```ts
import type { AgentResult, Dispatch } from '@osdlc/rule-review'

const dispatch: Dispatch = async (spec) => {
  // spec.prompt holds the rules and the diffs; spec.permissions is read-only.
  return {
    ok: true,
    exitCode: 0,
    durationMs: 1,
    structured: { findings: [] },
  } as AgentResult
}

const run = await reviewChanges({ base: 'main', dispatch })
```

[examples/run.test.ts](../../examples/run.test.ts) shows a full run this way,
including a finding and a skipped source.
