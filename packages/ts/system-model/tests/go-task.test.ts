import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { goTask } from '../src/plugins/runners/index.ts'
import { readTaskfile } from '../src/plugins/runners/go-task.ts'
import { type Canned, collect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

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
  return { discovery: 'walk' as const, tools: [goTask], ...extra }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('go-task runner', () => {
  test('absent on an empty root', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const catalog = await collect(dir, opts())
    expect(catalog.reports.find((r) => r.runner === 'go-task')).toBeUndefined()
  })

  test('a realistic Taskfile.yml produces declared tasks with doc from desc', async () => {
    const dir = await root({
      'Taskfile.yml': [
        "version: '3'",
        '',
        'tasks:',
        '  build:',
        '    desc: Build the binary',
        '    cmds:',
        '      - go build -o bin/app .',
        '  test:',
        '    desc: Run the test suite',
        '    cmds:',
        '      - go test ./...',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports.find((r) => r.runner === 'go-task')
    expect(report?.status).toBe('ok')

    const list = tasks(catalog)
    const build = byName(list, 'build')
    expect(build).toBeDefined()
    expect(build?.argv).toEqual(['task', 'build'])
    expect(build?.display).toBe('task build')
    expect(build?.doc).toBe('Build the binary')
    expect(build?.origin).toBe('declared')
    expect(build?.cwd).toBe('.')

    const testTask = byName(list, 'test')
    expect(testTask?.doc).toBe('Run the test suite')
  })

  test('summary is used when desc is absent', async () => {
    const dir = await root({
      'Taskfile.yml': [
        'tasks:',
        '  deploy:',
        '    summary: Deploys the app to production after building it.',
        '    cmds:',
        '      - ./deploy.sh',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    const deploy = byName(list, 'deploy')
    expect(deploy?.doc).toBe('Deploys the app to production after building it.')
  })

  test('desc wins over summary when both are present', async () => {
    const dir = await root({
      'Taskfile.yml': [
        'tasks:',
        '  release:',
        '    desc: Cut a release',
        '    summary: A much longer explanation of the release process.',
        '    cmds:',
        '      - ./release.sh',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    expect(byName(list, 'release')?.doc).toBe('Cut a release')
  })

  test('internal tasks are omitted', async () => {
    const dir = await root({
      'Taskfile.yml': [
        'tasks:',
        '  build:',
        '    desc: Build',
        '    cmds:',
        '      - go build .',
        '  _helper:',
        '    internal: true',
        '    cmds:',
        '      - echo helper',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    expect(byName(list, 'build')).toBeDefined()
    expect(byName(list, '_helper')).toBeUndefined()
  })

  test("nested Taskfile uses --dir naming that directory, cwd stays '.'", async () => {
    const dir = await root({
      'apps/api/Taskfile.yml': [
        'tasks:',
        '  serve:',
        '    desc: Serve the API',
        '    cmds:',
        '      - go run .',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    const serve = byName(list, 'serve')
    expect(serve?.argv).toEqual(['task', '--dir', 'apps/api', 'serve'])
    expect(serve?.display).toBe('task --dir apps/api serve')
    expect(serve?.cwd).toBe('.')
  })

  test('a lower-priority Taskfile in the same directory is pinned with --taskfile', async () => {
    // go-task reads exactly one Taskfile per directory, chosen by its own
    // filename priority. `Taskfile.yml` wins over `Taskfile.dist.yml`, so
    // neither the bare root form nor `--dir` can reach the latter's tasks.
    // `task dist-only` resolves Taskfile.yml and errors "Task \"dist-only\"
    // does not exist". Only `--taskfile` addresses it.
    const dir = await root({
      'Taskfile.yml': ['tasks:', '  build:', '    cmds:', '      - go build', ''].join('\n'),
      'Taskfile.dist.yml': ['tasks:', '  dist-only:', '    cmds:', '      - go build', ''].join(
        '\n',
      ),
      'sub/taskfile.yaml': ['tasks:', '  lint:', '    cmds:', '      - golangci-lint run', ''].join(
        '\n',
      ),
      'sub/Taskfile.yml': ['tasks:', '  fmt:', '    cmds:', '      - gofmt -l .', ''].join('\n'),
    })
    const list = tasks(await collect(dir, opts()))

    // The highest-priority Taskfile in each directory keeps the address that
    // go-task's own search finds.
    expect(byName(list, 'build')?.argv).toEqual(['task', 'build'])
    expect(byName(list, 'fmt')?.argv).toEqual(['task', '--dir', 'sub', 'fmt'])
    // The other Taskfiles are addressed by file with `--taskfile`.
    expect(byName(list, 'dist-only')?.argv).toEqual([
      'task',
      '--taskfile',
      'Taskfile.dist.yml',
      'dist-only',
    ])
    expect(byName(list, 'dist-only')?.display).toBe('task --taskfile Taskfile.dist.yml dist-only')
    expect(byName(list, 'lint')?.argv).toEqual(['task', '--taskfile', 'sub/taskfile.yaml', 'lint'])
    expect(byName(list, 'lint')?.cwd).toBe('.')
  })

  test('comments and quoted keys are handled', async () => {
    const dir = await root({
      'Taskfile.yml': [
        '# top-level comment',
        "version: '3'",
        'tasks:',
        "  'build':", // quoted key
        "    desc: 'Build it' # trailing comment",
        '    cmds:',
        "      - echo 'building # not a comment inside quotes'",
        '  "test":', // double-quoted key
        '    desc: "Run tests"',
        '    cmds:',
        '      - go test ./...',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    expect(byName(list, 'build')?.doc).toBe('Build it')
    expect(byName(list, 'test')?.doc).toBe('Run tests')
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'Taskfile.yml': [
        'tasks:',
        '  build:',
        '    desc: Build',
        '    cmds:',
        '      - go build .',
        '',
      ].join('\n'),
      'apps/api/Taskfile.yml': [
        'tasks:',
        '  serve:',
        '    desc: Serve',
        '    cmds:',
        '      - go run .',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const list = tasks(catalog)
    expect(list.length).toBeGreaterThan(0)
    for (const arg of list.flatMap((t) => t.argv)) {
      expect(arg).not.toMatch(/[;|&`]|\$\(/)
    }
  })

  describe('diagnostics for unparseable YAML constructs', () => {
    test('an anchor/alias produces the honest diagnostic', async () => {
      const dir = await root({
        'Taskfile.yml': [
          'tasks:',
          '  build: &common',
          '    desc: Build',
          '    cmds:',
          '      - go build .',
          '  rebuild:',
          '    <<: *common',
          '',
        ].join('\n'),
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      expect(
        report?.diagnostics.some(
          (d) => d.severity === 'warning' && /anchors and aliases/.test(d.message),
        ),
      ).toBe(true)
    })

    test('a merge key produces the honest diagnostic', async () => {
      const dir = await root({
        'Taskfile.yml': ['tasks:', '  build:', '    <<: *defaults', '    desc: Build', ''].join(
          '\n',
        ),
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      expect(
        report?.diagnostics.some((d) => d.severity === 'warning' && /merge keys/.test(d.message)),
      ).toBe(true)
    })

    test('a flow-style tasks: mapping produces the honest diagnostic and reads no tasks', async () => {
      const dir = await root({
        'Taskfile.yml': "tasks: { build: { cmds: ['go build .'] } }\n",
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      expect(report?.status).toBe('absent')
      expect(
        report?.diagnostics.some(
          (d) => d.severity === 'warning' && /flow-style `tasks:` mapping/.test(d.message),
        ),
      ).toBe(true)
    })

    test('a multi-document file produces the honest diagnostic', async () => {
      const dir = await root({
        'Taskfile.yml': [
          'tasks:',
          '  build:',
          '    desc: Build',
          '    cmds:',
          '      - go build .',
          '---',
          'some: other-document',
          '',
        ].join('\n'),
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      expect(
        report?.diagnostics.some(
          (d) => d.severity === 'warning' && /multi-document YAML/.test(d.message),
        ),
      ).toBe(true)
      // The first document is still read.
      expect(byName(tasks(catalog), 'build')).toBeDefined()
    })

    test('includes: produces the honest diagnostic', async () => {
      const dir = await root({
        'Taskfile.yml': [
          'includes:',
          '  docs: ./docs/Taskfile.yml',
          'tasks:',
          '  build:',
          '    desc: Build',
          '    cmds:',
          '      - go build .',
          '',
        ].join('\n'),
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      expect(
        report?.diagnostics.some((d) => d.severity === 'warning' && /includes:/.test(d.message)),
      ).toBe(true)
      // The file's own tasks are still read.
      expect(byName(tasks(catalog), 'build')).toBeDefined()
    })

    test('every diagnostic carries the source file', async () => {
      const dir = await root({
        'Taskfile.yml': ['tasks:', '  build: &common', '    desc: Build', ''].join('\n'),
      })
      const catalog = await collect(dir, opts())
      const report = catalog.reports.find((r) => r.runner === 'go-task')
      for (const d of report?.diagnostics ?? []) {
        expect(d.source).toBe('Taskfile.yml')
      }
    })
  })
})

describe('readTaskfile', () => {
  test('returns no tasks and no warnings for a file with no tasks: key', () => {
    const { tasks: found, warnings } = readTaskfile("version: '3'\n")
    expect(found.size).toBe(0)
    expect(warnings).toEqual([])
  })

  test('skips a block-scalar desc rather than reporting the literal indicator', () => {
    const { tasks: found } = readTaskfile(
      [
        'tasks:',
        '  build:',
        '    desc: |',
        '      A very long',
        '      multi-line description.',
        '',
      ].join('\n'),
    )
    expect(found.get('build')?.desc).toBeUndefined()
  })

  test('does not descend into nested cmds/vars fields', () => {
    const { tasks: found } = readTaskfile(
      [
        'tasks:',
        '  build:',
        '    desc: Build',
        '    vars:',
        '      desc: not the task description',
        '    cmds:',
        '      - go build .',
        '',
      ].join('\n'),
    )
    expect(found.get('build')?.desc).toBe('Build')
  })
})

/**
 * The listing path: `task --list-all --json`.
 *
 * No test here needs `task` installed. Presence comes from `fakeWhich` and
 * output is canned through `makeRunner`. A change in go-task's JSON shape
 * shows up as a deliberate fixture update, not as a suite that passes on one
 * machine and fails on another.
 */
describe('go-task listing path', () => {
  /** A Taskfile the reader can only partly read: `includes:` and an anchor. */
  const HARD_TASKFILE = [
    "version: '3'",
    '',
    'includes:',
    '  docs: ./docs/Taskfile.yml',
    '',
    'tasks:',
    '  build: &common',
    '    desc: Build the binary',
    '    cmds:',
    '      - go build .',
    '  _helper:',
    '    internal: true',
    '    cmds:',
    '      - echo helper',
    '',
  ].join('\n')

  /** go-task's `--json` listing shape — see the ListedTask docblock for the citation. */
  function listing(
    entries: { name: string; desc?: string; taskfile?: string }[],
    location = '',
  ): string {
    return JSON.stringify({
      tasks: entries.map((e) => ({
        name: e.name,
        task: e.name,
        desc: e.desc ?? '',
        summary: '',
        up_to_date: false,
        ...(e.taskfile ? { location: { line: 1, column: 3, taskfile: e.taskfile } } : {}),
      })),
      location,
    })
  }

  function execOpts(canned: Canned[], present: Record<string, string> = { task: '/usr/bin/task' }) {
    const { make, calls } = fakeRunners(canned)
    return {
      options: opts({ makeRunner: make, which: fakeWhich(present), allowExec: true }),
      calls,
    }
  }

  test('the reader is the floor: allowExec false attempts no subprocess', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { make, calls } = fakeRunners([])
    const catalog = await collect(
      dir,
      opts({ makeRunner: make, which: fakeWhich({ task: '/usr/bin/task' }) }),
    )
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(calls).toEqual([])
    expect(byName(tasks(catalog), 'build')?.doc).toBe('Build the binary')
    // Both reader limitations this file trips are still reported.
    const messages = report?.diagnostics.map((d) => d.message).join('\n') ?? ''
    expect(messages).toMatch(/includes:/)
    expect(messages).toMatch(/anchors and aliases/)
  })

  test('allowExec with no `task` on the PATH uses the reader and says what is missing', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options, calls } = execOpts([], {})
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(calls).toEqual([])
    expect(byName(tasks(catalog), 'build')).toBeDefined()
    const missing = report?.diagnostics.find((d) => /not on the PATH/.test(d.message))
    expect(missing?.severity).toBe('warning')
    expect(missing?.message).toMatch(/includes:/)
    expect(missing?.message).toMatch(/anchors/)
  })

  test('the listing suppresses all five reader limitations and enumerates includes', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: listing(
          [
            { name: 'build', desc: 'Build the binary', taskfile: `${dir}/Taskfile.yml` },
            // Resolved from `includes:`. Discovery never saw this file, so this
            // listing is the only place it exists.
            { name: 'docs:build', desc: 'Build the docs', taskfile: `${dir}/docs/Taskfile.yml` },
          ],
          `${dir}/Taskfile.yml`,
        ),
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')
    const list = tasks(catalog)

    expect(byName(list, 'build')?.doc).toBe('Build the binary')
    expect(byName(list, 'docs:build')?.doc).toBe('Build the docs')
    expect(byName(list, 'docs:build')?.argv).toEqual(['task', 'docs:build'])

    // None of the five reader-limit warnings applies once go-task did the parsing.
    const messages = (report?.diagnostics ?? [])
      .filter((d) => d.severity !== 'info')
      .map((d) => d.message)
      .join('\n')
    for (const stale of [
      /includes:/,
      /anchors and aliases/,
      /merge keys/,
      /flow-style/,
      /multi-document/,
    ]) {
      expect(messages).not.toMatch(stale)
    }
    expect(report?.diagnostics.some((d) => d.severity === 'warning')).toBe(false)
    // One line per run, not per file, and so not about any one file.
    const infos = report?.diagnostics.filter((d) => d.severity === 'info') ?? []
    expect(infos.length).toBe(1)
    expect(infos[0]?.message).toMatch(/--list-all --json/)
    expect(infos[0]?.source).toBeUndefined()
  })

  test('internal tasks stay excluded when a listing exposes one', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: listing(
          [
            { name: 'build', desc: 'Build the binary', taskfile: `${dir}/Taskfile.yml` },
            { name: '_helper', taskfile: `${dir}/Taskfile.yml` },
          ],
          `${dir}/Taskfile.yml`,
        ),
      },
    ])
    const list = tasks(await collect(dir, options))
    expect(byName(list, 'build')).toBeDefined()
    expect(byName(list, '_helper')).toBeUndefined()
  })

  test('the argv sent to `task` names the discovered file with --taskfile', async () => {
    const dir = await root({ 'apps/api/Taskfile.yml': 'tasks:\n  serve:\n    desc: Serve\n' })
    const { options, calls } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'apps/api/Taskfile.yml'],
        stdout: listing([
          { name: 'serve', desc: 'Serve', taskfile: `${dir}/apps/api/Taskfile.yml` },
        ]),
      },
    ])
    const list = tasks(await collect(dir, options))

    expect(calls.length).toBe(1)
    expect(calls[0]?.binary).toBe('task')
    expect(calls[0]?.argv).toEqual(['--list-all', '--json', '--taskfile', 'apps/api/Taskfile.yml'])
    // The run options matter. Without the timeout, a Taskfile whose includes
    // reach the network hangs a `parse`-kind provider. Without the signal, a
    // cancelled collect keeps running.
    expect(calls[0]?.opts.cwd).toBe(dir)
    expect(typeof calls[0]?.opts.timeoutMs).toBe('number')
    expect(calls[0]?.opts.timeoutMs).toBeGreaterThan(0)
    expect(calls[0]?.opts.signal).toBeInstanceOf(AbortSignal)
    // The emitted command is the reader's, unchanged: `--dir`, never `--taskfile`.
    expect(byName(list, 'serve')?.argv).toEqual(['task', '--dir', 'apps/api', 'serve'])
    expect(byName(list, 'serve')?.display).toBe('task --dir apps/api serve')
    expect(byName(list, 'serve')?.cwd).toBe('.')
  })

  test('an included Taskfile that discovery also found is not reported twice', async () => {
    const dir = await root({
      'Taskfile.yml': [
        'includes:',
        '  docs: ./docs',
        'tasks:',
        '  build:',
        '    desc: Build',
        '',
      ].join('\n'),
      'docs/Taskfile.yml': ['tasks:', '  build:', '    desc: Build the docs', ''].join('\n'),
    })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: listing(
          [
            { name: 'build', desc: 'Build', taskfile: `${dir}/Taskfile.yml` },
            { name: 'docs:build', desc: 'Build the docs', taskfile: `${dir}/docs/Taskfile.yml` },
          ],
          `${dir}/Taskfile.yml`,
        ),
      },
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'docs/Taskfile.yml'],
        stdout: listing([
          { name: 'build', desc: 'Build the docs', taskfile: `${dir}/docs/Taskfile.yml` },
        ]),
      },
    ])
    const list = tasks(await collect(dir, options))

    expect(list.map((t) => t.display).sort()).toEqual(['task --dir docs build', 'task build'])
    expect(byName(list, 'docs:build')).toBeUndefined()
    expect(list.find((t) => t.source === 'docs/Taskfile.yml')?.doc).toBe('Build the docs')
  })

  test('an aggregator root that owns no tasks of its own is a success, not a fallback', async () => {
    // A common shape: a root Taskfile with only `version:` and `includes:`.
    // Its listing answers correctly and every task belongs to the included
    // file, so the root emits nothing. It must not re-emit the `includes:`
    // warning, which the listing has just shown to be false.
    const dir = await root({
      'Taskfile.yml': ["version: '3'", '', 'includes:', '  docs: ./docs', ''].join('\n'),
      'docs/Taskfile.yml': ['tasks:', '  build:', '    desc: Build the docs', ''].join('\n'),
    })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: listing(
          [{ name: 'docs:build', desc: 'Build the docs', taskfile: `${dir}/docs/Taskfile.yml` }],
          `${dir}/Taskfile.yml`,
        ),
      },
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'docs/Taskfile.yml'],
        stdout: listing([
          { name: 'build', desc: 'Build the docs', taskfile: `${dir}/docs/Taskfile.yml` },
        ]),
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')
    const list = tasks(catalog)

    expect(list.map((t) => t.display)).toEqual(['task --dir docs build'])
    expect(report?.diagnostics.filter((d) => d.severity === 'warning')).toEqual([])
    expect(report?.diagnostics.filter((d) => d.severity === 'info').length).toBe(1)
  })

  test('a non-zero exit falls back to the reader and explains', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        exitCode: 1,
        stderr: 'task: Failed to parse Taskfile.yml:\nyaml: line 7: did not find expected key\n',
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    // The fallback held: the reader's tasks and warnings are back.
    expect(byName(tasks(catalog), 'build')?.doc).toBe('Build the binary')
    const messages = report?.diagnostics.map((d) => d.message).join('\n') ?? ''
    expect(messages).toMatch(/did not answer for this file/)
    expect(messages).toMatch(/Failed to parse Taskfile.yml/)
    expect(messages).toMatch(/includes:/)
    expect(messages).toMatch(/anchors and aliases/)
  })

  test('unparseable listing output falls back to the reader', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: 'task: build\ntask: _helper\n',
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(byName(tasks(catalog), 'build')).toBeDefined()
    expect(report?.diagnostics.some((d) => /unparseable --json listing/.test(d.message))).toBe(true)
  })

  test('an empty listing is a failure, not an answer', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: JSON.stringify({ tasks: [], location: `${dir}/Taskfile.yml` }),
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(byName(tasks(catalog), 'build')?.doc).toBe('Build the binary')
    expect(report?.diagnostics.some((d) => /named no tasks at all/.test(d.message))).toBe(true)
  })

  test('stdout with no `tasks` array falls back to the reader', async () => {
    const dir = await root({ 'Taskfile.yml': HARD_TASKFILE })
    const { options } = execOpts([
      {
        binary: 'task',
        argv: ['--list-all', '--json', '--taskfile', 'Taskfile.yml'],
        stdout: JSON.stringify({ location: `${dir}/Taskfile.yml` }),
      },
    ])
    const catalog = await collect(dir, options)
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(byName(tasks(catalog), 'build')).toBeDefined()
    expect(report?.diagnostics.some((d) => /no `tasks` array/.test(d.message))).toBe(true)
  })
})

/**
 * Two cases the shared `yaml-lite.ts` lexer handles before the reader runs.
 * Lexed wrongly, each one drops tasks silently and emits a diagnostic that
 * says the opposite. So each test asserts that the tasks are present and that
 * the false warning is absent.
 */
describe('go-task reader lexing', () => {
  test("a BOM'd `tasks:` on the first line still yields its tasks", async () => {
    // `version:` is optional in Task v3, so `tasks:` really is line one here.
    // The BOM is written as the escape, never as a literal byte — see
    // `scripts/guard-control-chars.ts`.
    const dir = await root({
      'Taskfile.yml':
        '\uFEFF' +
        [
          'tasks:',
          '  build:',
          '    desc: Build the binary',
          '    cmds:',
          '      - go build .',
          '',
        ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    expect(report?.status).toBe('ok')
    const build = byName(tasks(catalog), 'build')
    expect(build).toBeDefined()
    expect(build?.doc).toBe('Build the binary')
    expect(report?.diagnostics).toEqual([])
  })

  test('a `---` inside a cmds: block scalar is shell text, not a document separator', async () => {
    const dir = await root({
      'Taskfile.yml': [
        "version: '3'",
        '',
        'tasks:',
        '  build:',
        '    desc: Build',
        '    cmds:',
        '      - |',
        '        cat <<EOF',
        '        ---',
        '        EOF',
        '  test:',
        '    desc: Test',
        '    cmds:',
        '      - go test ./...',
        '',
      ].join('\n'),
    })
    const catalog = await collect(dir, opts())
    const report = catalog.reports.find((r) => r.runner === 'go-task')

    // Everything after the block scalar is still read.
    const list = tasks(catalog)
    expect(byName(list, 'build')).toBeDefined()
    expect(byName(list, 'test')).toBeDefined()
    expect(byName(list, 'test')?.doc).toBe('Test')
    // And nothing claims a second document was dropped.
    expect(report?.diagnostics.some((d) => /multi-document YAML/.test(d.message))).toBe(false)
    expect(report?.diagnostics).toEqual([])
  })
})
