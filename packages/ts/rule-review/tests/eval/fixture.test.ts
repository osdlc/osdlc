/**
 * The fixture, asserted without a model.
 *
 * A fixture that quietly stops exercising what it claims to does not fail —
 * it scores well, for the wrong reason. These tests pin the parts the eval
 * silently depends on: that both rule sources are found, that the changeset
 * is the diff, and that every file the case names is actually in it.
 */
import { describe, expect, test } from 'vitest'

import { changedFiles, fileDiffs } from '../../src/changeset.ts'
import { planJobs } from '../../src/plan.ts'
import { instructionFiles } from '../../src/providers/instruction-files.ts'
import { discoverSources } from '../../src/run.ts'
import { DEFAULT_CONFIG } from '../../src/types.ts'
import { makeEvalFixture, RULE_BREACH_CASE } from './fixture.ts'

describe('the eval fixture', () => {
  test('the changeset is exactly the files the case reasons about', async () => {
    const fixture = makeEvalFixture()
    try {
      const files = changedFiles(fixture.repo.git, fixture.base)
      const named = [
        ...RULE_BREACH_CASE.expected.map((e) => e.file),
        ...RULE_BREACH_CASE.clean,
      ].sort()

      expect(files.sort()).toEqual(named)
    } finally {
      fixture.repo.cleanup()
    }
  })

  test('both rule sources are discovered, including the nested one', async () => {
    const fixture = makeEvalFixture()
    try {
      const files = changedFiles(fixture.repo.git, fixture.base)
      const sources = await discoverSources([instructionFiles()], {
        projectRoot: fixture.repo.dir,
        changedFiles: files,
      })

      expect(sources.map((s) => s.path).sort()).toEqual(['CLAUDE.md', 'src/CLAUDE.md'])
      // The nested source has to actually carry its own prose — an empty one
      // would make the src/report.ts expectation unfindable by construction.
      const nested = sources.find((s) => s.path === 'src/CLAUDE.md')
      expect(nested?.text).toContain('must not import from')
    } finally {
      fixture.repo.cleanup()
    }
  })

  test('the nested source governs the file whose breach only it forbids', async () => {
    const fixture = makeEvalFixture()
    try {
      const files = changedFiles(fixture.repo.git, fixture.base)
      const sources = await discoverSources([instructionFiles()], {
        projectRoot: fixture.repo.dir,
        changedFiles: files,
      })
      const { jobs } = planJobs(sources, files, {
        ...DEFAULT_CONFIG,
        maxFilesPerJob: 0,
      })

      const nested = jobs.find((j) => j.source.path === 'src/CLAUDE.md')
      expect(nested?.files).toContain('src/report.ts')
    } finally {
      fixture.repo.cleanup()
    }
  })

  test('every planted breach reaches the judge as a diff it can quote', async () => {
    const fixture = makeEvalFixture()
    try {
      const files = changedFiles(fixture.repo.git, fixture.base)
      const diffs = fileDiffs(fixture.repo.git, fixture.base, files)
      const byFile = new Map(diffs.map((d) => [d.file, d.diff]))

      // Each expectation asserts the judge quotes a specific string. If that
      // string is not in the diff, the case is unpassable and the eval would
      // be measuring nothing.
      for (const expected of RULE_BREACH_CASE.expected) {
        const diff = byFile.get(expected.file)
        expect(diff).toBeDefined()
        if (expected.evidence !== undefined) {
          expect(diff!.toLowerCase()).toContain(expected.evidence.toLowerCase())
        }
      }
    } finally {
      fixture.repo.cleanup()
    }
  })

  test('the near-miss files really do contain the tempting string', async () => {
    const fixture = makeEvalFixture()
    try {
      const files = changedFiles(fixture.repo.git, fixture.base)
      const byFile = new Map(
        fileDiffs(fixture.repo.git, fixture.base, files).map((d) => [d.file, d.diff]),
      )

      // The near-misses are only near-misses if the bait is present. A judge
      // that greps must be tempted, or a clean score proves nothing.
      expect(byFile.get('src/describe.ts')).toContain('any')
      expect(byFile.get('src/serve.ts')).toContain('child_process')
    } finally {
      fixture.repo.cleanup()
    }
  })
})
