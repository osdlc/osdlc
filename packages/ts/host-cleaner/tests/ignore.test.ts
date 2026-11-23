/** The ignore list: matching, the survey and re-check drops, and `idleHours: 0`. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { containsIgnored, coveredBy, expandHome, ignorePaths } from '../src/ignore.ts'
import { plan, recheck, survey } from '../src/run.ts'
import { effectiveSettings, settingsOf } from '../src/settings.ts'
import { envOf } from '../src/artifacts.ts'
import type { Candidate, Ctx, Plugin, RunCtx } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-ignore-')))
  dirs.push(d)
  return d
}

/** Whether the temp directory's volume ignores letter case, as macOS's does by default. */
const caseInsensitive = ((): boolean => {
  const d = mkdtempSync(join(tmpdir(), 'host-cleaner-case-'))
  try {
    mkdirSync(join(d, 'Probe'))
    return existsSync(join(d, 'probe'))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})()

const cand = (id: string, path: string, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  kind: 'artifact',
  path,
  owner: 'p',
  why: 'idle',
  evidence: {},
  ...extra,
})

const plugin = (cs: Candidate[]): Plugin => ({
  name: 'p',
  detect: () => true,
  discover: () => cs,
  delete: () => 'ok',
})

describe('ignorePaths and coveredBy', () => {
  test('an entry covers itself and what is below it, not a sibling with the same prefix', () => {
    const ignore = ignorePaths(['/a/b'], '/', '/home')
    expect(coveredBy('/a/b', ignore)).toBe('/a/b')
    expect(coveredBy('/a/b/c/d', ignore)).toBe('/a/b')
    expect(coveredBy('/a/bc', ignore)).toBeUndefined()
    expect(coveredBy('pid 12', ignore)).toBeUndefined()
  })

  test('~ is home, a relative entry starts at cwd, and a link into an ignored directory is covered', () => {
    expect(expandHome('~/x', '/home/me')).toBe('/home/me/x')
    expect(ignorePaths(['~/x', 'y'], '/work', '/home/me')).toEqual(['/home/me/x', '/work/y'])
    const root = temp()
    mkdirSync(join(root, 'real'))
    symlinkSync(join(root, 'real'), join(root, 'link'))
    expect(
      coveredBy(join(root, 'real', 'f'), ignorePaths([join(root, 'link')], root, root)),
    ).toBeDefined()
  })

  test.skipIf(!caseInsensitive)(
    'on a volume that ignores letter case, an entry in other case covers the directory on disk',
    () => {
      const root = temp()
      mkdirSync(join(root, 'Code', 'Keep'), { recursive: true })
      const ignore = ignorePaths([join(root, 'code', 'keep')], root, root)
      expect(coveredBy(join(root, 'Code', 'Keep', 'target'), ignore)).toBeDefined()
      expect(containsIgnored(join(root, 'Code'), ignore)).toBeDefined()
    },
  )
})

describe('survey and recheck', () => {
  const ctx = (ignore: string[]): RunCtx => ({ cwd: '/', targets: [], allow: [], ignore })

  test('survey drops candidates in an ignored path, by `at` when set, and says how many', async () => {
    const p = plugin([
      cand('a:1', '/keep/x'),
      cand('a:2', '/skip/x'),
      cand('a:3', 'repo:branch', { at: '/skip/repo' }),
    ])
    const s = await survey([p], ctx(['/skip']))
    expect(s.candidates.map((c) => c.id)).toEqual(['a:1'])
    expect(s.warnings).toContain('ignore /skip: left out 2 candidate(s)')
  })

  test('recheck drops a planned candidate that is now ignored, and a plan keeps its own ignore list', async () => {
    const p = plugin([cand('a:1', '/keep/x'), cand('a:2', '/skip/x')])
    const swept = plan(await survey([p], ctx([])), { ignore: [] })
    const now = await recheck(swept, [p], ctx(['/skip']))
    expect(now.decision.run.map((c) => c.id)).toEqual(['a:1'])
    expect(now.decision.dropped).toContainEqual({
      id: 'a:2',
      reason: 'ignored',
      detail: 'inside ignored /skip',
    })
    const own = plan(await survey([p], ctx([])), { ignore: ['/skip'] })
    expect((await recheck(own, [p], ctx([]))).decision.run.map((c) => c.id)).toEqual(['a:1'])
  })
})

describe('idleHours', () => {
  test('0 is kept, a negative value falls back, and a plugin inherits the shared one', () => {
    const c: Ctx = { cwd: '/', targets: [], allow: [], signal: new AbortController().signal }
    expect(envOf({ idleHours: 0 }, c).idleHours).toBe(0)
    expect(envOf({ idleHours: -1 }, c).idleHours).toBe(24)
    expect(settingsOf('cargo', {}, { idleHours: 3 }).idleHours).toBe(3)
    expect(settingsOf('cargo', { idleHours: 0 }, { idleHours: 3 }).idleHours).toBe(0)
    expect(settingsOf('cargo', {}).idleHours).toBe(24)
    const row = effectiveSettings({ node: { idleHours: 1 } }, { idleHours: 3 })
    expect(row.cargo!.find((r) => r.key === 'idleHours')).toMatchObject({
      value: 3,
      source: 'shared',
    })
    expect(row.node!.find((r) => r.key === 'idleHours')).toMatchObject({
      value: 1,
      source: 'config',
    })
  })
})

describe('the command line', () => {
  test('--ignore and the config ignore are listed by status and recorded by plan', async () => {
    const home = temp()
    const cwd = temp()
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ ignore: ['/cfg-ignored'], idleHours: 0 }))
    const env = { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home }
    const run = async (argv: string[]) => {
      const c = captureContext({ cwd, env })
      const code = await main(argv, c, {
        plugins: [
          plugin([
            cand('a:1', '/cfg-ignored/x'),
            cand('a:2', '/cli-ignored/x'),
            cand('a:3', '/ok'),
          ]),
        ],
      })
      return { code, out: c.io.out }
    }
    const status = await run(['status', '--config', config, '--ignore', '/cli-ignored'])
    expect(status.out).toContain('ignoring: /cfg-ignored, /cli-ignored')
    expect(status.out).toContain('a:3')
    expect(status.out).not.toContain('a:1')
    expect(status.out).not.toContain('a:2')
    const saved = JSON.parse(
      (await run(['plan', '--config', config, '--ignore', '/cli-ignored'])).out,
    )
    expect(saved.ignore).toEqual(['/cfg-ignored', '/cli-ignored'])
    const shown = await run(['config', '--config', config])
    expect(shown.out).toContain('ignore: /cfg-ignored')
    expect(shown.out).toMatch(/idleHours = 0 {2}\(idleHours\)/)
  })
})

describe('containsIgnored', () => {
  test('a directory holding an ignored path is flagged, a sibling is not', () => {
    expect(containsIgnored('/repo/target', ['/repo/target/debug'])).toBe('/repo/target/debug')
    expect(containsIgnored('/repo/target2', ['/repo/target/debug'])).toBeUndefined()
  })
})
