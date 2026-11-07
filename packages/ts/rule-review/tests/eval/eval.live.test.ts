/**
 * The live eval: a real judge scored against a fixture with a known answer.
 * Opt in with `RULE_REVIEW_EVAL=1` or `pnpm run test:eval`. See CONTRIBUTING.md.
 */
import { describe, expect, test } from 'vitest'

import { adapterFor, type AgentName, BUILTIN_AGENTS, detectAgents } from '@osdlc/agent-call'

import { changedFiles, fileDiffs } from '../../src/changeset.ts'
import { instructionFiles } from '../../src/providers/instruction-files.ts'
import { discoverSources, review } from '../../src/run.ts'
import { DEFAULT_CONFIG } from '../../src/types.ts'
import { makeEvalFixture } from './fixture.ts'
import { gatingFailures, scoreCase } from './score.ts'
import { renderScoreboard, type RunOutcome } from './scoreboard.ts'

const ENABLED = process.env['RULE_REVIEW_EVAL'] === '1'
const ENGINE = process.env['RULE_REVIEW_EVAL_ENGINE'] ?? 'claude'
const MODEL = process.env['RULE_REVIEW_EVAL_MODEL']
/** How many times to judge the same fixture; above 1 adds a stability report. */
const RUNS = Math.max(1, Number.parseInt(process.env['RULE_REVIEW_EVAL_RUNS'] ?? '1', 10) || 1)

function isAgentName(name: string): name is AgentName {
  return (BUILTIN_AGENTS as readonly string[]).includes(name)
}

describe.skipIf(!ENABLED)('eval — judge quality against a known answer', () => {
  test('finds every planted breach and invents none', { timeout: 900_000 }, async () => {
    if (!isAgentName(ENGINE)) {
      throw new Error(
        `eval: unknown engine ${ENGINE} (expected one of ${BUILTIN_AGENTS.join(', ')})`,
      )
    }
    const [agent] = await detectAgents([adapterFor(ENGINE)])
    // The run was opted into, so a missing CLI fails rather than passing empty.
    if (agent?.available !== true) throw new Error(`eval: ${ENGINE} is not installed`)

    const fixture = makeEvalFixture()
    try {
      const root = fixture.repo.dir
      const files = changedFiles(fixture.repo.git, fixture.base)
      const sources = await discoverSources([instructionFiles()], {
        projectRoot: root,
        changedFiles: files,
      })

      // Both rule sources must be in play, or the run measures less than it
      // claims to. Asserted before the model call so a fixture that stopped
      // exercising the nested scope fails fast and cheaply.
      expect(sources.map((s) => s.path).sort()).toEqual(['CLAUDE.md', 'src/CLAUDE.md'])

      const diffs = fileDiffs(fixture.repo.git, fixture.base, files)
      const outcomes: RunOutcome[] = []
      let degraded = false

      // Serial, not concurrent: the runs are a sample of the judge's own
      // variance, and putting a dozen agent processes on one machine adds
      // load-dependent timing to whatever variance is really there.
      for (let i = 0; i < RUNS; i++) {
        const started = Date.now()
        const run = await review({
          projectRoot: root,
          sources,
          changedFiles: files,
          diffs,
          config: {
            ...DEFAULT_CONFIG,
            engine: ENGINE,
            ...(MODEL === undefined ? {} : { model: MODEL }),
          },
        })
        degraded = degraded || run.degraded
        outcomes.push({
          case: fixture.evalCase,
          score: scoreCase(run.findings, fixture.evalCase),
          durationMs: Date.now() - started,
          engine: ENGINE,
          ...(MODEL === undefined ? {} : { model: MODEL }),
        })
      }

      console.log('\n' + renderScoreboard(outcomes) + '\n')

      // A degraded run says nothing about judgement quality — an agent that
      // could not be reached has not formed an opinion to grade.
      expect(degraded).toBe(false)

      // Every run gates, rather than a best-of or an average. A judge that
      // passes two runs in three is not a judge that passes: the failing run
      // is what a person would have been handed that day.
      const failures = outcomes.flatMap((o, i) =>
        gatingFailures(o.score).map((f) => (RUNS === 1 ? f : `run ${i + 1}: ${f}`)),
      )
      expect(failures).toEqual([])
    } finally {
      fixture.repo.cleanup()
    }
  })
})
