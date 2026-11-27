import { captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'
import { MANIFEST_FILES } from '@osdlc/system-model/build'
import { describe, expect, test } from 'vitest'

import { createMain } from '../src/cli/main.ts'
import { buildPackageMap, manifestTest } from '../src/describe/packages.ts'
import { renderPackageMap, riskSignals } from '../src/describe/render.ts'
import { describeChange, spliceDescription } from '../src/measure.ts'
import { buildDiffReport } from '../src/report/diff.ts'
import type { Change } from '../src/types.ts'
import { diff } from './helpers.ts'
import { testRepo } from './repo-fixture.ts'

const CHANGE: Change = { kind: 'range', label: 'a..b', pr: null, base: null, head: null }
const report = (d: string) => buildDiffReport(CHANGE, d, null)

describe('buildPackageMap', () => {
  const manifests = [
    { dir: '', name: 'root' },
    { dir: 'packages/core', name: '@x/core' },
    { dir: 'packages/app', name: '@x/app' },
    { dir: 'packages/cli', name: '@x/cli' },
  ]
  const dependencies = [
    { from: 'packages/app', to: 'packages/core' },
    { from: 'packages/cli', to: 'packages/core' },
    { from: 'packages/app', to: 'packages/app' },
  ]

  test('changed packages, their direct dependents, and the edges between them', () => {
    const r = report(
      diff('packages/core/src/a.ts', ['-a()', '+b()', '+c()']) + diff('docs/x.md', ['+text']),
    )
    const map = buildPackageMap(r, manifests, dependencies)
    expect(map.nodes.map((n) => [n.label, n.status, n.files, n.added, n.removed])).toEqual([
      ['@x/core', 'changed', 1, 2, 1],
      ['root', 'changed', 1, 1, 0],
      ['@x/app', 'affected', 0, 0, 0],
      ['@x/cli', 'affected', 0, 0, 0],
    ])
    expect(map.edges).toEqual([
      { from: 'packages/app', to: 'packages/core' },
      { from: 'packages/cli', to: 'packages/core' },
    ])
    expect(map.omitted).toBe(0)
  })

  test('a cap keeps the largest changes and counts the rest', () => {
    const r = report(
      diff('packages/core/a.ts', ['+1', '+2', '+3']) + diff('packages/app/a.ts', ['+1']),
    )
    const map = buildPackageMap(r, manifests, dependencies, { maxNodes: 1 })
    expect(map.nodes.map((n) => n.dir)).toEqual(['packages/core'])
    expect(map.omitted).toBe(1)
  })

  test('a file renamed across packages counts where it was and where it went', () => {
    const rename =
      'diff --git a/packages/core/x.ts b/packages/app/x.ts\nsimilarity index 50%\n' +
      'rename from packages/core/x.ts\nrename to packages/app/x.ts\n' +
      '--- a/packages/core/x.ts\n+++ b/packages/app/x.ts\n@@ -1 +1 @@\n-a()\n+b()\n'
    const map = buildPackageMap(report(rename), manifests, dependencies)
    expect(
      map.nodes
        .filter((n) => n.status === 'changed')
        .map((n) => [n.label, n.files, n.added, n.removed]),
    ).toEqual([
      ['@x/app', 1, 1, 0],
      ['@x/core', 1, 0, 1],
    ])
  })

  test('dependents fill what the cap leaves, and the root is never one', () => {
    const r = report(diff('packages/core/a.ts', ['+1']))
    const withRoot = [...dependencies, { from: '', to: 'packages/core' }]
    const map = buildPackageMap(r, manifests, withRoot, { maxNodes: 2 })
    expect(map.nodes.map((n) => [n.dir, n.status])).toEqual([
      ['packages/core', 'changed'],
      ['packages/app', 'affected'],
    ])
    expect(map.omittedDependents).toBe(1)
    expect(renderPackageMap(map)).toContain('_Not shown: 1 more dependent package(s)._')
  })

  test('renders a Mermaid flowchart that a name cannot break', () => {
    const r = report(diff('packages/core/a.ts', ['+x()']))
    const out = renderPackageMap(
      buildPackageMap(r, [{ dir: 'packages/core', name: 'a "quoted" <name>' }], []),
    )
    expect(out).toContain('```mermaid\nflowchart LR')
    expect(out).toContain('p0["a #quot;quoted#quot; #lt;name#gt;<br/>+1 −0"]:::changed')
    expect(renderPackageMap({ nodes: [], edges: [], omitted: 0, omittedDependents: 0 })).toContain(
      '_No package changed._',
    )
  })
})

describe('manifestTest', () => {
  test("system-model's manifest names, at any depth", () => {
    const isManifest = manifestTest(MANIFEST_FILES)
    expect(
      ['package.json', 'a/Cargo.toml', 'apackage.json', 'x/Cargo.lock'].map(isManifest),
    ).toEqual([true, true, false, false])
  })
})

describe('riskSignals', () => {
  test('facts from the report, and none for a quiet change', () => {
    const r = report(
      diff('lib/a.ts', ['-a()', '+b()']) +
        'diff --git a/old.ts b/old.ts\ndeleted file mode 100644\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n' +
        diff('skills/s/SKILL.md', ['+Do it.']) +
        diff('bun.lock', ['+x']),
    )
    expect(riskSignals(r)).toEqual([
      '1 file(s) deleted',
      'Source logic changed (2 lines) with no test file changed',
      '1 agent instruction file(s) changed, which changes what agents do',
      '1 generated file(s) changed; check they were regenerated, not edited',
    ])
    expect(riskSignals(report(diff('lib/a.test.ts', ['+t()'])))).toEqual([])
  })

  test('complexity is stated in exact totals, since the movers are capped', () => {
    const r = report(diff('lib/a.test.ts', ['+t()']))
    const mover = { path: 'lib/a.ts', before: 1, anonymous: false }
    r.complexity = {
      ...r.complexity,
      status: 'ok',
      totalBefore: 10,
      totalAfter: 14,
      functionsChanged: 70,
      movers: [
        { ...mover, name: 'shrinks', after: 0, delta: -6 },
        { ...mover, name: 'grows', after: 6, delta: 5 },
      ],
    }
    expect(riskSignals(r)).toEqual([
      'Cyclomatic complexity +4 net across 70 changed function(s); largest rise in `grows` (+5)',
    ])
  })
  test('a net rise is reported even when every capped mover fell', () => {
    const r = report(diff('lib/a.test.ts', ['+t()']))
    r.complexity = {
      ...r.complexity,
      status: 'ok',
      totalBefore: 10,
      totalAfter: 13,
      functionsChanged: 90,
      movers: [
        { path: 'lib/a.ts', name: 'shrinks', before: 9, after: 1, delta: -8, anonymous: false },
      ],
    }
    expect(riskSignals(r)).toEqual(['Cyclomatic complexity +3 net across 90 changed function(s)'])
  })
})

function twoPackages() {
  const r = testRepo()
  r.commit('base', {
    'packages/core/package.json': JSON.stringify({ name: '@x/core', version: '1.0.0' }),
    'packages/core/src/a.ts': 'export function a(): number {\n  return 1\n}\n',
    'packages/app/package.json': JSON.stringify({
      name: '@x/app',
      dependencies: { '@x/core': 'workspace:*' },
    }),
    'packages/app/src/main.ts': "import { a } from '@x/core'\nconsole.log(a())\n",
  })
  r.git('switch', '-q', '-c', 'feature')
  r.commit('feature', {
    'packages/core/src/a.ts':
      'export function a(n = 1): number {\n  if (n > 1) return n\n  return 1\n}\n',
  })
  return r
}

describe('describeChange', () => {
  test('the map of packages comes from the manifests at the change’s head', async () => {
    const r = twoPackages()
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'feature' },
      {
        cwd: r.dir,
      },
    )
    expect(d.packages.nodes.map((n) => [n.label, n.status])).toEqual([
      ['@x/core', 'changed'],
      ['@x/app', 'affected'],
    ])
    expect(d.packages.edges).toEqual([{ from: 'packages/app', to: 'packages/core' }])
    expect(d.markdown).toContain('## Summary')
    expect(d.markdown).toContain('<!-- code-stats:packages:start -->')
    expect(d.markdown).toContain('Exported API removed or changed in 1 file(s)')
  })

  test('a deleted package keeps the name its base manifest gave it', async () => {
    const r = twoPackages()
    r.git('switch', '-q', 'main')
    r.commit('old package', {
      'packages/old/package.json': JSON.stringify({ name: '@x/old' }),
      'packages/old/index.ts': 'export const old = 1\n',
    })
    r.git('switch', '-q', '-c', 'drop')
    r.git('rm', '-q', '-r', 'packages/old')
    r.commit('drop old')
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'drop' },
      { cwd: r.dir },
    )
    expect(d.packages.nodes.map((n) => [n.label, n.files, n.removed])).toEqual([['@x/old', 2, 2]])
  })

  test('the base commit’s manifests are read only when the change deletes or renames one', async () => {
    const r = twoPackages()
    const listed: string[] = []
    const real = spawnRunner('git')
    const git: CommandRunner = {
      binary: real.binary,
      run: (argv, opts) => {
        if (argv[0] === 'ls-tree') listed.push(argv.find((a) => /^[0-9a-f]{40}$/.test(a)) ?? '')
        return real.run(argv, opts)
      },
    }
    await describeChange(
      { kind: 'merge-base', base: 'main', head: 'feature' },
      { cwd: r.dir, runners: { git } },
    )
    expect(listed).toEqual([r.git('rev-parse', 'feature')])

    r.git('mv', 'packages/app', 'packages/client')
    r.commit('move app')
    listed.length = 0
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'feature' },
      { cwd: r.dir, runners: { git } },
    )
    expect(listed).toEqual([r.git('rev-parse', 'feature'), r.git('rev-parse', 'main')])
    expect(d.packages.nodes.map((n) => [n.dir, n.label])).toContainEqual(['packages/app', '@x/app'])
  })

  test('the map is the PR’s own wherever it is run: a package it adds is named from its head', async () => {
    const r = twoPackages()
    r.commit('new package', {
      'packages/new/package.json': JSON.stringify({ name: '@x/new' }),
      'packages/new/index.ts': 'export const n = 1\n',
    })
    r.git('switch', '-q', 'main')
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'feature' },
      { cwd: r.dir },
    )
    expect(d.packages.nodes.map((n) => n.label)).toContain('@x/new')
  })

  test('a deleted crate is named from its base Cargo.toml, whatever comes before its name', async () => {
    const r = testRepo()
    r.commit('base', {
      'crates/old/Cargo.toml':
        '[package]\nauthors = ["a"]\nname = \'old-crate\'\nversion = "0.1.0"\n',
      'crates/old/src/lib.rs': 'pub fn f() {}\n',
    })
    r.git('switch', '-q', '-c', 'drop')
    r.git('rm', '-q', '-r', 'crates/old')
    r.commit('drop')
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'drop' },
      { cwd: r.dir },
    )
    expect(d.packages.nodes.map((n) => n.label)).toEqual(['old-crate'])
  })

  test('for uncommitted work, the working tree’s manifests are read, git-ignored ones left out', async () => {
    const r = twoPackages()
    r.commit('ignore', { '.gitignore': 'scratch/\n' })
    r.write({
      'scratch/package.json': JSON.stringify({
        name: '@x/scratch',
        dependencies: { '@x/core': 'workspace:*' },
      }),
      'packages/core/src/a.ts': 'export function a(): number {\n  return 2\n}\n',
      'packages/app/package.json': JSON.stringify({
        name: '@x/app-renamed',
        dependencies: { '@x/core': 'workspace:*' },
      }),
    })
    const d = await describeChange({ kind: 'worktree' }, { cwd: r.dir })
    expect(d.packages.nodes.map((n) => n.label)).toEqual(['@x/core', '@x/app-renamed'])
  })

  test('splicing keeps the author’s text and refreshes only the generated blocks', async () => {
    const r = twoPackages()
    const d = await describeChange(
      { kind: 'merge-base', base: 'main', head: 'feature' },
      {
        cwd: r.dir,
      },
    )
    expect(spliceDescription('', d)).toBe(d.markdown)
    const written = d.markdown.replace(
      '<!-- What this change does, in plain language: the outcome, not the steps. -->',
      'Lets `a` take a count.',
    )
    expect(spliceDescription(written, d)).toBe(written)
    const stale = written.replace(
      /<!-- code-stats:risk:start -->[\s\S]*?<!-- code-stats:risk:end -->/,
      '<!-- code-stats:risk:start -->\nold\n<!-- code-stats:risk:end -->',
    )
    expect(spliceDescription(stale, d)).toBe(written)
    const bare = spliceDescription('My own description.\n', d)
    expect(bare.startsWith('My own description.\n\n## Change statistics')).toBe(true)
    expect(bare).toContain('## Packages')
    expect(bare).toContain('## Risk')
    expect(spliceDescription(bare, d)).toBe(bare)
  })
})

describe('code-stats describe', () => {
  test('prints the description, and --write fills an empty PR body', async () => {
    const r = twoPackages()
    const base = r.git('rev-parse', 'main')
    const head = r.git('rev-parse', 'feature')
    let body = ''
    const gh = fakeRunner((argv) => {
      if (argv.join(' ') === 'pr view 8 --json baseRefOid,headRefOid') {
        return { stdout: JSON.stringify({ baseRefOid: base, headRefOid: head }) }
      }
      if (argv[0] === 'pr' && argv[1] === 'view')
        return { stdout: JSON.stringify({ number: 8, body }) }
      if (argv[0] === 'pr' && argv[1] === 'edit') {
        body = argv[argv.indexOf('--body') + 1] ?? ''
        return { stdout: '' }
      }
      return undefined
    })
    const main = createMain({ gh: gh.runner })
    const ctx = captureContext({ cwd: r.dir })
    expect(await main(['describe', '8', '--write'], ctx)).toBe(0)
    expect(ctx.io.out).toContain('## Packages')
    expect(ctx.io.err).toContain('wrote the description into PR #8')
    expect(body).toBe(ctx.io.out)
    const again = captureContext({ cwd: r.dir })
    expect(await main(['describe', '#8', '--write'], again)).toBe(0)
    expect(again.io.err).toContain('PR #8 already holds this description')
    const json = captureContext({ cwd: r.dir })
    expect(await main(['describe', 'main...feature', '--json'], json)).toBe(0)
    expect(JSON.parse(json.io.out).packages.nodes).toHaveLength(2)
  })
})
