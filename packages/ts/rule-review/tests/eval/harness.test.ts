/**
 * Does the eval fail when the judge is wrong?
 *
 * A suite that has only ever passed cannot be told from one that cannot fail,
 * and a perfect score is what BOTH look like. These tests drive the real
 * pipeline — the fixture, the real planner, the real prompt — with the model
 * replaced through the dispatch seam, so the harness is fed known-bad answers
 * and must object to each of them.
 *
 * No model runs here, so this is part of the ordinary suite rather than the
 * opt-in eval. The negative control is exactly the thing you want checked on
 * every push; the expensive positive one is not.
 */
import { describe, expect, test } from 'vitest'

import type { AgentResult } from '@osdlc/agent-call'

import { changedFiles, fileDiffs } from '../../src/changeset.ts'
import { instructionFiles } from '../../src/providers/instruction-files.ts'
import { discoverSources, review, type Dispatch } from '../../src/run.ts'
import { DEFAULT_CONFIG } from '../../src/types.ts'
import { makeEvalFixture } from './fixture.ts'
import { gatingFailures, scoreCase } from './score.ts'

/** A stand-in judge that always replies with the same findings. */
function judgeReturning(findings: unknown[]): Dispatch {
  return () =>
    Promise.resolve({
      ok: true,
      exitCode: 0,
      durationMs: 1,
      structured: { findings },
      planned: {} as AgentResult['planned'],
      raw: {} as AgentResult['raw'],
    } as AgentResult)
}

/** Run the real pipeline over the fixture with a stubbed judge. */
async function scoreWith(dispatch: Dispatch) {
  const fixture = makeEvalFixture()
  try {
    const files = changedFiles(fixture.repo.git, fixture.base)
    const sources = await discoverSources([instructionFiles()], {
      projectRoot: fixture.repo.dir,
      changedFiles: files,
    })
    const run = await review({
      projectRoot: fixture.repo.dir,
      sources,
      changedFiles: files,
      diffs: fileDiffs(fixture.repo.git, fixture.base, files),
      config: DEFAULT_CONFIG,
      dispatch,
    })
    return {
      score: scoreCase(run.findings, fixture.evalCase),
      failures: gatingFailures(scoreCase(run.findings, fixture.evalCase)),
    }
  } finally {
    fixture.repo.cleanup()
  }
}

describe('the eval has teeth', () => {
  test('a judge that reports nothing fails on every planted breach', async () => {
    const { score, failures } = await scoreWith(judgeReturning([]))

    expect(score.matched).toEqual([])
    expect(failures).toHaveLength(3)
    // Named, not counted: the failure has to say which breach went unnoticed.
    expect(failures.join('\n')).toContain('src/parse.ts')
    expect(failures.join('\n')).toContain('src/shell.ts')
    expect(failures.join('\n')).toContain('src/report.ts')
  })

  test('a judge that flags a near-miss fails, even having found everything', async () => {
    const { score, failures } = await scoreWith(
      judgeReturning([
        { file: 'src/parse.ts', evidence: 'input: any', why: 'uses any', severity: 'violation' },
        {
          file: 'src/shell.ts',
          evidence: 'node:child_process',
          why: 'direct spawn',
          severity: 'violation',
        },
        {
          file: 'src/report.ts',
          evidence: '../test/helpers.ts',
          why: 'imports test/',
          severity: 'violation',
        },
        // The trap: src/describe.ts says "any" in prose and is typed `unknown`.
        {
          file: 'src/describe.ts',
          evidence: 'Accepts any shape',
          why: 'uses any',
          severity: 'violation',
        },
      ]),
    )

    expect(score.recall).toBe(1)
    // Asserted by file, not by count: both rule sources govern src/, so a
    // stub judge that answers every job reports the near-miss once per job.
    // What must hold is that the near-miss is caught as spurious at all.
    expect(new Set(score.spurious.map((f) => f.file))).toEqual(new Set(['src/describe.ts']))
    expect(failures.every((f) => f.includes('spurious') && f.includes('src/describe.ts'))).toBe(
      true,
    )
    expect(failures.length).toBeGreaterThan(0)
  })

  test('the other near-miss is trapped too', async () => {
    const { failures } = await scoreWith(
      judgeReturning([
        // src/serve.ts NAMES node:child_process while deliberately not importing it.
        {
          file: 'src/serve.ts',
          evidence: 'node:child_process',
          why: 'direct spawn',
          severity: 'violation',
        },
      ]),
    )
    expect(failures.some((f) => f.includes('src/serve.ts') && f.includes('spurious'))).toBe(true)
  })

  test('a judge citing the right file for the wrong reason still fails', async () => {
    // Same file, evidence that does not contain what the case demands. This is
    // the case that would slip through if matching were on path alone.
    const { failures } = await scoreWith(
      judgeReturning([
        {
          file: 'src/shell.ts',
          evidence: 'missing doc comment',
          why: 'undocumented',
          severity: 'violation',
        },
      ]),
    )
    expect(failures.some((f) => f.includes('src/shell.ts') && f.includes('missed'))).toBe(true)
  })

  test('a judge grading every breach as drift fails the severity floor', async () => {
    const { failures } = await scoreWith(
      judgeReturning([
        { file: 'src/parse.ts', evidence: 'input: any', why: 'uses any', severity: 'drift' },
        { file: 'src/shell.ts', evidence: 'node:child_process', why: 'spawn', severity: 'drift' },
        {
          file: 'src/report.ts',
          evidence: '../test/helpers.ts',
          why: 'test import',
          severity: 'drift',
        },
      ]),
    )
    // The case accepts violation|tension. Calling a flat contradiction `drift`
    // is a calibration failure, and every planted breach should report it.
    expect(failures).toHaveLength(3)
    expect(failures.every((f) => f.startsWith('missed:'))).toBe(true)
  })

  test('the exact expected answer passes — the control for the controls', async () => {
    const { score, failures } = await scoreWith(
      judgeReturning([
        {
          file: 'src/parse.ts',
          evidence: 'input: any',
          why: 'the any type is forbidden',
          severity: 'violation',
        },
        {
          file: 'src/shell.ts',
          evidence: 'node:child_process',
          why: 'must use run()',
          severity: 'violation',
        },
        {
          file: 'src/report.ts',
          evidence: '../test/helpers.ts',
          why: 'src must not import test/',
          severity: 'violation',
        },
      ]),
    )

    expect(failures).toEqual([])
    expect(score.recall).toBe(1)
    expect(score.precision).toBe(1)
    expect(score.spurious).toEqual([])
  })
})
