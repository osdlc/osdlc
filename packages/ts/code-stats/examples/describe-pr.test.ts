import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  PACKAGES_SECTION,
  RISK_SECTION,
  STATS_SECTION,
  buildPackageMap,
  describeChange,
  diffChange,
  parseChangeSpec,
  renderDescription,
  renderDiff,
  renderPackageMap,
  renderRisk,
  riskSignals,
  spliceDescription,
  spliceSection,
  writeDescription,
  writePrBody,
  type Runners,
} from '@osdlc/code-stats'

const made: string[] = []
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A workspace of three packages on `main`, and a branch `feature` that changes the lowest. */
function workspace() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-example-')))
  made.push(dir)
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Example', '-c', 'user.email=example@example.invalid', ...args],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      },
    )
  const commit = (message: string, files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    git('add', '-A')
    git('commit', '-q', '-m', message)
  }
  git('init', '-q', '-b', 'main')
  commit('base', {
    'packages/money/package.json': '{"name":"@shop/money"}\n',
    'packages/cart/package.json':
      '{"name":"@shop/cart","dependencies":{"@shop/money":"workspace:*"}}\n',
    'packages/money/src/index.ts':
      'export function round(n: number): number {\n  return Math.round(n * 100) / 100\n}\n',
    'packages/cart/src/index.ts':
      "import { round } from '@shop/money'\nexport const total = (n: number) => round(n)\n",
  })
  git('switch', '-q', '-c', 'feature')
  commit('change', {
    'packages/money/src/index.ts':
      'export function round(n: number, places = 2): number {\n  const f = 10 ** places\n  return Math.round(n * f) / f\n}\n',
  })
  return dir
}

/** A `gh` that holds one PR body: `pr view` reads it, `pr edit --body` replaces it. */
function fakeGh(body: string) {
  const state = { body, edits: 0 }
  const runner: NonNullable<Runners['gh']> = {
    binary: 'gh',
    run: (argv) => {
      if (argv[0] === 'pr' && argv[1] === 'view') {
        return { exitCode: 0, stdout: JSON.stringify({ number: 4, body: state.body }), stderr: '' }
      }
      if (argv[0] === 'pr' && argv[1] === 'edit') {
        state.body = argv[argv.indexOf('--body') + 1] ?? ''
        state.edits += 1
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  return { state, runners: { gh: runner } satisfies Runners }
}

test('describeChange: the statistics, the package map and the risk signals', async () => {
  const cwd = workspace()
  const d = await describeChange(parseChangeSpec('main...feature'), { cwd })

  expect(d.packages.nodes.map((n) => [n.label, n.status])).toEqual([
    ['@shop/money', 'changed'],
    ['@shop/cart', 'affected'],
  ])
  expect(d.markdown).toBe(renderDescription(d.report, d.packages))
  expect(d.markdown).toContain(PACKAGES_SECTION.start)
  expect(d.markdown).toContain(RISK_SECTION.start)
  expect(d.markdown).toContain(STATS_SECTION.start)

  expect(renderPackageMap(d.packages)).toContain('flowchart LR')
  expect(riskSignals(d.report)).toContain(
    'Source logic changed (3 lines) with no test file changed',
  )
  expect(renderRisk(d.report)).toContain('- Source logic changed (3 lines)')
})

test('buildPackageMap draws a map from a report and the manifests', async () => {
  const cwd = workspace()
  const report = diffChange(parseChangeSpec('main...feature'), { cwd })
  const map = buildPackageMap(
    report,
    [
      { dir: 'packages/money', name: '@shop/money' },
      { dir: 'packages/cart', name: '@shop/cart' },
    ],
    [{ from: 'packages/cart', to: 'packages/money' }],
    { maxNodes: 8 },
  )
  expect(map.edges).toEqual([{ from: 'packages/cart', to: 'packages/money' }])
  expect(map.nodes.find((n) => n.dir === 'packages/money')).toMatchObject({
    status: 'changed',
    added: 3,
    removed: 2,
  })
})

test('spliceDescription fills an empty body and refreshes only the generated blocks', async () => {
  const cwd = workspace()
  const d = await describeChange(parseChangeSpec('main...feature'), { cwd })

  expect(spliceDescription('', d)).toBe(d.markdown)

  const body = spliceDescription('## Summary\n\nMy own words.\n', d)
  expect(body.startsWith('## Summary\n\nMy own words.\n')).toBe(true)
  expect(body).toContain(PACKAGES_SECTION.start)
  // A second splice finds the blocks and changes nothing.
  expect(spliceDescription(body, d)).toBe(body)
})

test('spliceSection replaces a block in place and touches nothing else', () => {
  const block = (text: string) => `${STATS_SECTION.start}\n${text}\n${STATS_SECTION.end}`
  const once = spliceSection('Intro\n', block('| table |'), STATS_SECTION)
  expect(once).toContain(STATS_SECTION.heading)
  const twice = spliceSection(once, block('| newer |'), STATS_SECTION)
  expect(twice).toContain('| newer |')
  expect(twice).not.toContain('| table |')
  expect(twice.startsWith('Intro\n')).toBe(true)
})

test('writePrBody and writeDescription edit a PR body once', async () => {
  const cwd = workspace()
  const report = diffChange(parseChangeSpec('main...feature'), { cwd })

  const stats = fakeGh('Summary\n')
  const options = { cwd, runners: stats.runners }
  expect(writePrBody(4, renderDiff(report), options)).toBe(true)
  expect(stats.state.body).toContain(STATS_SECTION.start)
  expect(writePrBody(4, renderDiff(report), options)).toBe(false)
  expect(stats.state.edits).toBe(1)

  const d = await describeChange(parseChangeSpec('main...feature'), { cwd })
  const whole = fakeGh('')
  expect(writeDescription(4, d, { cwd, runners: whole.runners })).toBe(true)
  expect(whole.state.body).toBe(d.markdown)
  expect(writeDescription(4, d, { cwd, runners: whole.runners })).toBe(false)
})
