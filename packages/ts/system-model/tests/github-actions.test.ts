import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { githubActions } from '../src/plugins/runners/index.ts'
import { collect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
function opts(extra: Record<string, unknown> = {}) {
  return { discovery: 'walk' as const, tools: [githubActions], ...extra }
}

function byWorkflow(list: Task[], workflow: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === workflow)
}

function messages(catalog: Awaited<ReturnType<typeof collect>>): string[] {
  return catalog.reports.flatMap((r) => r.diagnostics.map((d) => d.message))
}

function names(catalog: Awaited<ReturnType<typeof collect>>): string[] {
  return tasks(catalog)
    .map((t) => t.path[1] ?? '')
    .sort()
}

const DISPATCH_ONLY = [
  'name: Release',
  'on: workflow_dispatch',
  'jobs:',
  '  ship:',
  '    runs-on: ubuntu-latest',
  '',
].join('\n')

/**
 * A control workflow for every negative fixture.
 *
 * Without one, an assertion that the provider emitted nothing also passes
 * against a provider that is broken. A suppression test and a broken-collect
 * test would look the same. The control shows the provider still works on
 * this root, so the empty result means something.
 */
const CONTROL = ['name: Control', 'on: workflow_dispatch', 'jobs: {}', ''].join('\n')

/**
 * Written as the escape, never the literal byte. A raw U+FEFF is invisible in
 * editors and diffs, so a test that asserts on one must show it in source.
 */
const BOM = '\uFEFF'

describe('github-actions runner', () => {
  test('absent on an empty root', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const catalog = await collect(dir, opts())
    expect(catalog.reports.find((r) => r.runner === 'github-actions')).toBeUndefined()
  })

  test('a realistic workflow directory produces remote, declared tasks', async () => {
    const dir = await root({
      '.github/workflows/release.yml': DISPATCH_ONLY,
      '.github/workflows/deploy.yaml': [
        'name: Deploy to production',
        'on:',
        '  workflow_dispatch:',
        '  push:',
        '    branches: [main]',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/ci.yml': ['name: CI', 'on: [push, pull_request]', 'jobs: {}', ''].join(
        '\n',
      ),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports.find((r) => r.runner === 'github-actions')
    expect(report?.status).toBe('ok')

    const list = tasks(catalog)
    expect(list.map((t) => t.path[1]).sort()).toEqual(['deploy.yaml', 'release.yml'])

    const release = byWorkflow(list, 'release.yml')
    expect(release?.argv).toEqual(['gh', 'workflow', 'run', 'release.yml'])
    expect(release?.display).toBe('gh workflow run release.yml')
    expect(release?.doc).toBe('Release')
    expect(release?.source).toBe('.github/workflows/release.yml')
    expect(release?.origin).toBe('declared')
    expect(release?.parameters).toEqual([])
    expect(release?.persistent).toEqual({ value: false, declared: false })
    expect(release?.runner).toBe('github-actions')

    const deploy = byWorkflow(list, 'deploy.yaml')
    expect(deploy?.doc).toBe('Deploy to production')
    expect(deploy?.argv).toEqual(['gh', 'workflow', 'run', 'deploy.yaml'])

    // The reason `executes` exists: every emitted task runs remotely.
    for (const t of list) {
      expect(t.executes).toBe('remote')
      expect(t.cwd).toBe('.')
    }
  })

  test("tags, ids and the report's chain are what the contract promises", async () => {
    const dir = await root({
      '.github/workflows/release.yml': DISPATCH_ONLY,
      '.github/workflows/deploy.yaml': ['on: workflow_dispatch', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)

    for (const t of list) expect(t.tags).toEqual(['github-actions', 'ci', 'remote'])

    const ids = list.map((t) => t.id)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    // Distinct per workflow, so a UI can key rows by id.
    expect(new Set(ids).size).toBe(list.length)
    // Stable across a re-collect, so a selection survives a refresh.
    const again = await collect(dir, opts())
    expect(tasks(again).map((t) => t.id)).toEqual(ids)

    const report = catalog.reports.find((r) => r.runner === 'github-actions')
    expect(report?.chain.map((c) => c.label)).toEqual(['runner', 'workflow'])
    expect(report?.chain.every((c) => c.hint.length > 0)).toBe(true)
    // path is root-first with the runner at index 0, matching the chain.
    for (const t of list) expect(t.path[0]).toBe('github-actions')
  })

  test('a hostile workflow filename survives intact as a single argv element', async () => {
    // The invariant here is not "argv has no metacharacters". A workflow file
    // may legally use any of them in its name. The invariant is that argv stays
    // an array: the name arrives as one element, unsplit and unescaped, because
    // nothing joins argv back into a shell string.
    const hostile = 'my $(evil) `x`;rm.yml'
    const dir = await root({
      [`.github/workflows/${hostile}`]: DISPATCH_ONLY,
      '.github/workflows/control.yml': CONTROL,
    })
    const catalog = await collect(dir, opts())
    const task = byWorkflow(tasks(catalog), hostile)
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['gh', 'workflow', 'run', hostile])
    expect(task?.argv.length).toBe(4)
    // Verbatim: no quoting, no escaping, nothing dropped.
    expect(task?.argv[3]).toBe(hostile)

    // display is the human-readable form and is not executable (see model.ts
    // and the note at makeTask). It is the plain join, metacharacters and all.
    // A consumer must never rebuild argv from it.
    expect(task?.display).toBe(`gh workflow run ${hostile}`)
  })

  test('a workflow without workflow_dispatch is withheld, named, and counted', async () => {
    const dir = await root({
      '.github/workflows/release.yml': DISPATCH_ONLY,
      '.github/workflows/ci.yml': ['name: CI', 'on: [push, pull_request]', 'jobs: {}', ''].join(
        '\n',
      ),
      '.github/workflows/nightly.yml': [
        'name: Nightly',
        'on:',
        '  schedule:',
        "    - cron: '0 3 * * *'",
        '',
      ].join('\n'),
      '.github/workflows/untriggered.yml': ['name: Orphan', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    expect(list.map((t) => t.path[1])).toEqual(['release.yml'])

    const info = catalog.reports
      .flatMap((r) => r.diagnostics)
      .find((d) => d.severity === 'info' && d.message.includes('workflow_dispatch'))
    expect(info).toBeDefined()
    expect(info?.message).toContain('3 workflows')
    expect(info?.message).toContain('ci.yml')
    expect(info?.message).toContain('nightly.yml')
    expect(info?.message).toContain('untriggered.yml')
  })

  test('workflows present but none dispatchable is ok with zero tasks, not absent', async () => {
    const dir = await root({
      '.github/workflows/ci.yml': ['name: CI', 'on: [push]', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports.find((r) => r.runner === 'github-actions')
    expect(report?.status).toBe('ok')
    expect(report?.tasks).toEqual([])
    expect(report?.diagnostics.some((d) => d.message.includes('1 workflow '))).toBe(true)
  })

  test('all five on: forms are recognized, in both quoted spellings', async () => {
    const dir = await root({
      '.github/workflows/scalar.yml': ['on: workflow_dispatch', 'jobs: {}', ''].join('\n'),
      '.github/workflows/flow-seq.yml': ['on: [push, workflow_dispatch]', 'jobs: {}', ''].join(
        '\n',
      ),
      '.github/workflows/flow-map.yml': [
        'on: {push: {branches: [main]}, workflow_dispatch: {}}',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/block-map.yml': [
        'on:',
        '  push:',
        '    branches:',
        '      - main',
        '  workflow_dispatch:',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/block-seq.yml': [
        'on:',
        '  - push',
        '  - workflow_dispatch',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/quoted-on.yml': ['"on":', '  workflow_dispatch:', 'jobs: {}', ''].join(
        '\n',
      ),
      '.github/workflows/single-quoted-on.yml': [
        "'on':",
        '  workflow_dispatch:',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual([
      'block-map.yml',
      'block-seq.yml',
      'flow-map.yml',
      'flow-seq.yml',
      'quoted-on.yml',
      'scalar.yml',
      'single-quoted-on.yml',
    ])
  })

  test('a block-mapping trigger nested under push is not mistaken for a trigger', async () => {
    // `workflow_dispatch` here is a BRANCH name under push, not a trigger.
    const dir = await root({
      '.github/workflows/tricky.yml': [
        'on:',
        '  push:',
        '    branches:',
        '      - workflow_dispatch',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/control.yml': CONTROL,
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['control.yml'])
  })

  test('doc falls back to the filename when name: is absent', async () => {
    const dir = await root({
      '.github/workflows/release.yml': ['on: workflow_dispatch', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(tasks(catalog)[0]?.doc).toBe('release.yml')
  })

  test('a block-scalar name: is treated as absent, not read as the indicator', async () => {
    const dir = await root({
      '.github/workflows/scalar-name.yml': [
        'name: |',
        '  Multi',
        '  line',
        'on: workflow_dispatch',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const task = tasks(catalog)[0]
    expect(task?.path[1]).toBe('scalar-name.yml')
    expect(task?.doc).toBe('scalar-name.yml')
  })

  test('CRLF line endings read the same as LF', async () => {
    const dir = await root({
      '.github/workflows/crlf.yml': [
        'name: Windows',
        'on:',
        '  workflow_dispatch:',
        'jobs: {}',
        '',
      ].join('\r\n'),
    })
    const catalog = await collect(dir, opts())
    const task = tasks(catalog)[0]
    expect(task?.path[1]).toBe('crlf.yml')
    expect(task?.doc).toBe('Windows')
  })

  test('a leading UTF-8 BOM does not hide the trigger or the name', async () => {
    // JS `\s` matches U+FEFF, so without the BOM strip the bare-key regex
    // returns null for the whole first line. The workflow would then be
    // withheld with no warning, and counted in the info line as if it had been
    // read and found to lack a trigger.
    const dir = await root({
      '.github/workflows/bom.yml': `${BOM}on: workflow_dispatch\njobs: {}\n`,
      '.github/workflows/bom-name.yml': `${BOM}name: Named\non: workflow_dispatch\njobs: {}\n`,
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['bom-name.yml', 'bom.yml'])
    expect(byWorkflow(tasks(catalog), 'bom.yml')?.argv).toEqual([
      'gh',
      'workflow',
      'run',
      'bom.yml',
    ])
    expect(byWorkflow(tasks(catalog), 'bom-name.yml')?.doc).toBe('Named')
    // And no diagnostic at all: nothing was withheld, so nothing is explained.
    expect(messages(catalog)).toEqual([])
  })

  test('only .github/workflows/ at the repository root is picked up', async () => {
    const dir = await root({
      '.github/workflows/release.yml': DISPATCH_ONLY,
      // Basename-matching in ctx.files() returns all of these; the provider
      // must reject each for a different reason.
      'config.yml': DISPATCH_ONLY,
      'packages/x/.github/workflows/nested.yml': DISPATCH_ONLY,
      '.github/workflows/sub/deep.yml': DISPATCH_ONLY,
      '.github/actions/composite/action.yml': DISPATCH_ONLY,
      // No name before the extension: `gh workflow run .yml` identifies
      // nothing, so this is not a workflow this provider will offer.
      '.github/workflows/.yml': DISPATCH_ONLY,
    })
    const catalog = await collect(dir, opts())
    expect(tasks(catalog).map((t) => t.source)).toEqual(['.github/workflows/release.yml'])
  })

  test('multi-document files warn and read only the first document', async () => {
    const dir = await root({
      '.github/workflows/multi.yml': [
        'name: First',
        'on: workflow_dispatch',
        '---',
        'name: Second',
        'on: push',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog).some((m) => m.includes('multi-document'))).toBe(true)
    expect(tasks(catalog)[0]?.doc).toBe('First')
  })

  test('the `...` end-of-document marker ends the document too', async () => {
    const dir = await root({
      '.github/workflows/ended.yml': [
        'name: First',
        'on: workflow_dispatch',
        '...',
        'name: Second',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog).some((m) => m.includes('multi-document'))).toBe(true)
    expect(tasks(catalog)[0]?.doc).toBe('First')
  })

  test('an indented `---` inside a block scalar is text, not a document separator', async () => {
    // A `---` inside a `run: |` block is content, not a separator. If it were
    // read as a separator, the file would be truncated there. Key order in a
    // workflow is free, so an `on:` after `jobs:` would be lost. The workflow
    // would vanish, with a false multi-document warning and a false "cannot be
    // dispatched" line.
    const dir = await root({
      '.github/workflows/heredoc.yml': [
        'name: Late',
        'jobs:',
        '  b:',
        '    steps:',
        '      - run: |',
        '          cat <<EOF',
        '          ---',
        '          EOF',
        'on: workflow_dispatch',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['heredoc.yml'])
    expect(tasks(catalog)[0]?.doc).toBe('Late')
    expect(messages(catalog)).toEqual([])
  })

  test('an `on:` inside a block scalar is text, and does not make a workflow dispatchable', async () => {
    // The mirror of the test above: block-scalar content must not be read as
    // structure in either direction.
    const dir = await root({
      '.github/workflows/quoting.yml': [
        'name: Quoting',
        'on: [push]',
        'jobs:',
        '  b:',
        '    steps:',
        '      - run: |',
        "          echo 'on: workflow_dispatch'",
        '',
      ].join('\n'),
      '.github/workflows/control.yml': CONTROL,
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['control.yml'])
  })

  test('anchors and merge keys warn only where they could change the answer', async () => {
    // The stated limitation is that a trigger defined via an anchor/alias may
    // be misread. An anchor on a job cannot do that, and the `&defaults` /
    // `<<: *defaults` job pattern is common enough that warning on it would
    // teach a user to ignore this provider's warnings.
    const dir = await root({
      '.github/workflows/job-anchor.yml': [
        'on: workflow_dispatch',
        'jobs:',
        '  a: &base',
        '    runs-on: ubuntu-latest',
        '  b:',
        '    <<: *base',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['job-anchor.yml'])
    expect(messages(catalog)).toEqual([])
  })

  test('an anchor or merge key inside the on: block does warn', async () => {
    const dir = await root({
      '.github/workflows/alias-on.yml': ['name: Aliased', 'on: *triggers', 'jobs: {}', ''].join(
        '\n',
      ),
      '.github/workflows/merged-on.yml': [
        'on:',
        '  workflow_dispatch:',
        '  <<: *base',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const diags = catalog.reports.flatMap((r) => r.diagnostics)

    const anchor = diags.find((d) => d.message.includes('anchors and aliases'))
    expect(anchor?.severity).toBe('warning')
    expect(anchor?.source).toBe('.github/workflows/alias-on.yml')

    const merge = diags.find((d) => d.message.includes('merge keys'))
    expect(merge?.severity).toBe('warning')
    expect(merge?.source).toBe('.github/workflows/merged-on.yml')
  })

  test('a glob in a plain scalar inside the on: block is not an alias', async () => {
    // `*Integration` here is part of a plain scalar, which runs to the end of
    // the line. An alias can only start a node, so this one cannot define a
    // trigger and must not raise the anchor warning.
    const dir = await root({
      '.github/workflows/glob-input.yml': [
        'on:',
        '  workflow_dispatch:',
        '    inputs:',
        '      args:',
        '        default: go test -run *Integration',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['glob-input.yml'])
    expect(messages(catalog)).toEqual([])
  })

  test('a top-level merge key warns, because it could splice in an on:', async () => {
    const dir = await root({
      '.github/workflows/spliced.yml': [
        'defaults: &d',
        '  on: workflow_dispatch',
        '<<: *d',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(messages(catalog).some((m) => m.includes('merge keys'))).toBe(true)
  })

  test('an uninterpretable on: warns and fails open', async () => {
    const dir = await root({
      '.github/workflows/weird.yml': [
        'name: Weird',
        'on: [push, workflow_dispatch',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/empty-on.yml': ['name: Empty', 'on:', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['empty-on.yml', 'weird.yml'])
    const warned = catalog.reports
      .flatMap((r) => r.diagnostics)
      .filter((d) => d.message.includes('could not be interpreted'))
    expect(warned.map((d) => d.source).sort()).toEqual([
      '.github/workflows/empty-on.yml',
      '.github/workflows/weird.yml',
    ])
    expect(warned.every((d) => d.severity === 'warning')).toBe(true)
  })

  test('a multi-line flow form is not supported, and fails open with a warning', async () => {
    // Valid YAML that GitHub accepts. This reader needs the terminator on the
    // `on:` line. The limit is listed in the file header. If someone adds
    // support, this test fails and tells them to update that header.
    const dir = await root({
      '.github/workflows/flow-map-lines.yml': [
        'on: {',
        '  workflow_dispatch: {}',
        '}',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/flow-seq-lines.yml': [
        'on: [',
        '  workflow_dispatch',
        ']',
        'jobs: {}',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['flow-map-lines.yml', 'flow-seq-lines.yml'])
    const warned = catalog.reports
      .flatMap((r) => r.diagnostics)
      .filter((d) => d.message.includes('could not be interpreted'))
    expect(warned.map((d) => d.source).sort()).toEqual([
      '.github/workflows/flow-map-lines.yml',
      '.github/workflows/flow-seq-lines.yml',
    ])
  })

  test('an empty workflow is withheld as empty, not as lacking a trigger', async () => {
    // A zero-byte file has no trigger declaration that could be missing, so
    // the "requires an on.workflow_dispatch trigger" line would be a claim
    // about a document that does not exist. Failing open is wrong too, since
    // the emitted row could never run.
    const dir = await root({
      '.github/workflows/zero.yml': '',
      '.github/workflows/blank.yml': '   \n\n',
      '.github/workflows/control.yml': CONTROL,
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['control.yml'])

    const diags = catalog.reports.flatMap((r) => r.diagnostics)
    const empty = diags.filter((d) => d.message.includes('is empty'))
    expect(empty.map((d) => d.source).sort()).toEqual([
      '.github/workflows/blank.yml',
      '.github/workflows/zero.yml',
    ])
    expect(empty.every((d) => d.severity === 'warning')).toBe(true)
    // And they are not counted among the workflows that cannot be dispatched.
    expect(diags.some((d) => d.message.includes('requires an `on.workflow_dispatch`'))).toBe(false)
  })

  test('comments are not read as content', async () => {
    const dir = await root({
      '.github/workflows/commented.yml': [
        '# on: workflow_dispatch',
        'name: Commented',
        'on: [push]',
        'jobs: {}',
        '',
      ].join('\n'),
      '.github/workflows/control.yml': CONTROL,
    })
    const catalog = await collect(dir, opts())
    expect(names(catalog)).toEqual(['control.yml'])
  })

  test('the provider never spawns', async () => {
    const runners = fakeRunners([])
    const dir = await root({
      '.github/workflows/release.yml': DISPATCH_ONLY,
      '.github/workflows/ci.yml': ['on: [push]', 'jobs: {}', ''].join('\n'),
    })
    const catalog = await collect(
      dir,
      opts({ allowExec: true, makeRunner: runners.make, which: fakeWhich({ gh: '/usr/bin/gh' }) }),
    )
    expect(tasks(catalog).length).toBe(1)
    expect(runners.calls).toEqual([])
    const report = catalog.reports.find((r) => r.runner === 'github-actions')
    expect(report?.tool).toEqual({ binary: 'gh', found: true, path: '/usr/bin/gh' })
  })
})
