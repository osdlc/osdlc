import { afterAll, describe, expect, test } from 'vitest'

import { diagnostics, tasks, type Task } from '../src/model.ts'
import { rake } from '../src/plugins/ruby/index.ts'
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
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return { options: { discovery: 'walk' as const, makeRunner: make, ...extra }, calls }
}

const SHELL_METACHARS = /[;|&`]|\$\(/

const REALISTIC_RAKEFILE = `
require "rake/testtask"

desc "Run the test suite"
task :test do
  puts "running tests"
end

task :default => :test

namespace :db do
  desc "Migrate the database"
  task :migrate do
    puts "migrating"
  end

  task :seed => [:migrate] do
    puts "seeding"
  end

  namespace :schema do
    task :dump do
      puts "dumping"
    end
  end
end

task "release" do
  puts "releasing"
end

task 'clean'
`

describe('rake runner', () => {
  test('absent on an empty root', async () => {
    const dir = await root({ 'README.md': 'nothing here\n' })
    const { options } = opts()
    const result = await collect(dir, { ...options, tools: [rake] })

    expect(tasks(result)).toEqual([])
    expect(result.reports).toEqual([])
  })

  test('a realistic Rakefile produces declared tasks with doc from desc', async () => {
    const dir = await root({ Rakefile: REALISTIC_RAKEFILE })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    const test = found.find((t) => t.path[2] === 'test')
    expect(test?.doc).toBe('Run the test suite')
    expect(test?.origin).toBe('declared')
    expect(test?.argv).toEqual(['rake', 'test'])
    expect(test?.display).toBe('rake test')
    expect(test?.cwd).toBe('.')

    // `default` has no desc immediately before it, so no doc leaks onto it.
    const def = found.find((t) => t.path[2] === 'default')
    expect(def?.doc).toBeUndefined()
  })

  test('namespaced and nested-namespaced tasks report as ns:sub:name', async () => {
    const dir = await root({ Rakefile: REALISTIC_RAKEFILE })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    const migrate = found.find((t) => t.path[2] === 'db:migrate')
    expect(migrate).toBeDefined()
    expect(migrate?.doc).toBe('Migrate the database')
    expect(migrate?.argv).toEqual(['rake', 'db:migrate'])

    const seed = found.find((t) => t.path[2] === 'db:seed')
    expect(seed).toBeDefined()

    const dump = found.find((t) => t.path[2] === 'db:schema:dump')
    expect(dump).toBeDefined()
    expect(dump?.argv).toEqual(['rake', 'db:schema:dump'])
  })

  test('desc only attaches to the very next task, not one after that', async () => {
    const dir = await root({
      Rakefile: `
desc "For foo only"
task :foo do
end

task :bar do
end
`,
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    expect(found.find((t) => t.path[2] === 'foo')?.doc).toBe('For foo only')
    expect(found.find((t) => t.path[2] === 'bar')?.doc).toBeUndefined()
  })

  test('the several task literal forms all parse: symbol, double-quoted, single-quoted, with deps', async () => {
    const dir = await root({ Rakefile: REALISTIC_RAKEFILE })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    expect(found.map((t) => t.path[2])).toEqual(
      expect.arrayContaining([
        'test', // symbol, task :test do
        'default', // symbol with dep, task :default => :test
        'db:migrate', // symbol, namespaced
        'db:seed', // symbol with array dep
        'db:schema:dump', // symbol, nested namespace
        'release', // double-quoted
        'clean', // single-quoted, no block
      ]),
    )
  })

  test("nested addressing: a Rakefile in a subdirectory names that directory via -C, cwd stays '.'", async () => {
    const dir = await root({ 'sub/Rakefile': 'task :build do\nend\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    const build = found.find((t) => t.path[2] === 'build')
    expect(build?.argv).toEqual(['rake', '-C', 'sub', 'build'])
    expect(build?.cwd).toBe('.')
    expect(build?.display).toBe('rake -C sub build')
  })

  test('a root Rakefile emits no directory flag', async () => {
    const dir = await root({ Rakefile: 'task :build do\nend\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    expect(found[0]?.argv).toEqual(['rake', 'build'])
  })

  test('dynamic constructs produce an honest warning diagnostic', async () => {
    const dir = await root({
      Rakefile: `
require "rake/testtask"
Rake::TestTask.new(:spec) do |t|
  t.pattern = "spec/**/*_spec.rb"
end
`,
    })
    const { options } = opts()
    const result = await collect(dir, { ...options, tools: [rake] })
    const diags = diagnostics(result)

    expect(diags.length).toBeGreaterThan(0)
    const d = diags.find((x) => x.runner === 'rake')
    expect(d?.severity).toBe('warning')
    expect(d?.source).toBe('Rakefile')
    expect(d?.message).toContain('Rake::*Task.new')
    expect(d?.message).toContain('rake -T')
  })

  test('Dir.glob-built tasks also trip the diagnostic', async () => {
    const dir = await root({
      Rakefile: `
Dir.glob("lib/tasks/**/*.rake").each { |r| load r }
`,
    })
    const { options } = opts()
    const diags = diagnostics(await collect(dir, { ...options, tools: [rake] }))
    expect(diags.some((d) => d.runner === 'rake' && d.message.includes('Dir.glob'))).toBe(true)
  })

  test('plain declared tasks with no dynamic constructs raise no diagnostics', async () => {
    const dir = await root({ Rakefile: 'task :build do\nend\n' })
    const { options } = opts()
    const diags = diagnostics(await collect(dir, { ...options, tools: [rake] }))
    expect(diags.filter((d) => d.runner === 'rake')).toEqual([])
  })

  test('a namespace closed on its own opening line does not swallow later tasks', async () => {
    // `namespace :db do; end` closes the block on the same line. Confirmed
    // against a real rake: `rake -AT` on this exact file reports the task as
    // top-level `after`, not `db:after`.
    const dir = await root({
      Rakefile: 'namespace :db do; end\n\ntask :after do\nend\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [rake] }))

    expect(found.map((t) => t.path[2])).toEqual(['after'])
  })

  test('no argv element ever contains shell metacharacters', async () => {
    const dir = await root({
      Rakefile: REALISTIC_RAKEFILE,
      'sub/Rakefile': 'task :build do\nend\n',
    })
    const { options } = opts()
    const found: Task[] = tasks(await collect(dir, { ...options, tools: [rake] }))

    expect(found.length).toBeGreaterThan(0)
    for (const t of found) {
      for (const arg of t.argv) {
        expect(SHELL_METACHARS.test(arg)).toBe(false)
      }
    }
  })
})

// -------------------------------------------------------- the exec upgrade

/**
 * `rake -AT` output, recorded from rake 13.3.1 against a Rakefile with one
 * statically declared task, one `Rake::TestTask.new`, and a pair built by a
 * loop. A parser cannot see the last two shapes. rake's own format string is
 * `"#{name} %-#{width}s  # %s"`, so the gap before `#` is the name padding plus
 * two spaces.
 */
const LISTING = [
  'rake alpha       # gen alpha',
  'rake beta        # gen beta',
  'rake db:migrate  # Migrate the database',
  'rake default     # ',
  'rake spec        # Run tests for spec',
  'rake test        # Run the test suite',
].join('\n')

const DYNAMIC_RAKEFILE = `
require "rake/testtask"

desc "Run the test suite"
task :test do
  puts "running tests"
end

%w[alpha beta].each do |n|
  desc "gen #{n}"
  task n do
    puts n
  end
end

Rake::TestTask.new(:spec) do |t|
  t.pattern = "spec/**/*_spec.rb"
end
`

/** The listing the exec path asks for, canned. */
const CANNED_LISTING: Canned[] = [{ binary: 'rake', argv: ['-AT'], stdout: LISTING }]

describe('rake provider — the exec upgrade', () => {
  test('the parse floor is untouched when execution is not allowed, and nothing is run', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options, calls } = opts(CANNED_LISTING, {
      // On the PATH and still not used. The exec path needs the caller's
      // permission, not just an available binary.
      which: fakeWhich({ rake: '/usr/bin/rake' }),
    })
    const result = await collect(dir, { ...options, tools: [rake] })

    expect(tasks(result).map((t) => t.path[2])).toEqual(['test'])
    const diags = diagnostics(result).filter((d) => d.runner === 'rake')
    expect(diags.length).toBe(1)
    expect(diags[0]?.severity).toBe('warning')
    expect(diags[0]?.message).toContain('Rake::*Task.new')
    expect(calls.filter((c) => c.binary === 'rake')).toEqual([])
  })

  test('allowExec with no rake on the PATH parses and says the binary is missing', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options, calls } = opts(CANNED_LISTING, { which: fakeWhich({}) })
    const result = await collect(dir, {
      ...options,
      tools: [rake],
      allowExec: true,
    })

    expect(tasks(result).map((t) => t.path[2])).toEqual(['test'])
    const diags = diagnostics(result).filter((d) => d.runner === 'rake')
    expect(diags.some((d) => d.message.includes('not on the PATH'))).toBe(true)
    // The parser's limit still applies on this path, so it is still reported.
    expect(diags.some((d) => d.message.includes('Rake::*Task.new'))).toBe(true)
    expect(calls.filter((c) => c.binary === 'rake')).toEqual([])
  })

  test("the exec path lists what the parser cannot see, and drops the parser's warning", async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options } = opts(CANNED_LISTING, { which: fakeWhich({ rake: '/usr/bin/rake' }) })
    const result = await collect(dir, {
      ...options,
      tools: [rake],
      allowExec: true,
    })
    const found = tasks(result)

    expect(found.map((t) => t.path[2]).sort()).toEqual([
      'alpha',
      'beta',
      'db:migrate',
      'default',
      'spec',
      'test',
    ])
    // The loop-built and Rake::TestTask-built tasks the regex misses.
    expect(found.find((t) => t.path[2] === 'alpha')?.doc).toBe('gen alpha')
    expect(found.find((t) => t.path[2] === 'spec')?.doc).toBe('Run tests for spec')
    // An uncommented task prints a bare `# `. That means no doc, not an empty one.
    expect(found.find((t) => t.path[2] === 'default')?.doc).toBeUndefined()

    // Shapes match the parse path exactly.
    const one = found.find((t) => t.path[2] === 'test')!
    expect(one.argv).toEqual(['rake', 'test'])
    expect(one.display).toBe('rake test')
    expect(one.cwd).toBe('.')
    expect(one.source).toBe('Rakefile')
    expect(one.path).toEqual(['rake', '.', 'test'])
    expect(one.origin).toBe('declared')

    const diags = diagnostics(result).filter((d) => d.runner === 'rake')
    // rake listed these tasks, so no diagnostic may call them "invisible to a
    // parser".
    expect(diags.some((d) => d.message.includes('invisible to a parser'))).toBe(false)
    const honest = diags.find((d) => d.message.includes('rake -AT -N -G'))
    expect(honest?.severity).toBe('info')
    expect(honest?.message).toContain('evaluated the')
  })

  test('the argv sent to rake is exactly `-AT -N -G`, once', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options, calls } = opts(CANNED_LISTING, {
      which: fakeWhich({ rake: '/usr/bin/rake' }),
    })
    await collect(dir, { ...options, tools: [rake], allowExec: true })

    const rakeCalls = calls.filter((c) => c.binary === 'rake')
    expect(rakeCalls.length).toBe(1)
    expect(rakeCalls[0]?.argv).toEqual(['-AT', '-N', '-G'])
  })

  test('the probe is bounded and cancellable, and runs at the catalog root', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const controller = new AbortController()
    const { options, calls } = opts(CANNED_LISTING, {
      which: fakeWhich({ rake: '/usr/bin/rake' }),
      signal: controller.signal,
    })
    await collect(dir, { ...options, tools: [rake], allowExec: true })
    const run = calls.find((c) => c.binary === 'rake')!

    // A Rakefile that hangs must not hang the caller, and a cancelled collect
    // must stop the subprocess. Without these assertions, either could be
    // removed from the provider and no test would fail.
    expect(run.opts.timeoutMs).toBeGreaterThan(0)
    expect(run.opts.signal?.aborted).toBe(false)
    controller.abort()
    expect(run.opts.signal?.aborted).toBe(true)
    // rake is pointed at the catalog root, which is why the invocation needs
    // no -C and why `-N` is enough to keep it inside the scanned tree.
    expect(run.opts.cwd).toBe(dir)
  })

  test('a non-zero exit falls back to the parse path and explains why', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options } = opts(
      [
        {
          binary: 'rake',
          argv: ['-AT'],
          exitCode: 1,
          stderr: 'rake aborted!\nLoadError: cannot load such file',
        },
      ],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const result = await collect(dir, {
      ...options,
      tools: [rake],
      allowExec: true,
    })

    // Never an empty list: the parsed tasks are still returned.
    expect(tasks(result).map((t) => t.path[2])).toEqual(['test'])
    const diags = diagnostics(result).filter((d) => d.runner === 'rake')
    const failure = diags.find((d) => d.message.includes('failed'))
    expect(failure?.severity).toBe('warning')
    expect(failure?.message).toContain('rake aborted!')
    // Back on the parse path, the parser-limit warning applies again.
    expect(diags.some((d) => d.message.includes('Rake::*Task.new'))).toBe(true)
  })

  test('output with no recognizable task lines falls back the same way', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options } = opts(
      [
        {
          binary: 'rake',
          argv: ['-AT'],
          stdout: 'loading environment\nsomething went sideways\n',
        },
      ],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const result = await collect(dir, {
      ...options,
      tools: [rake],
      allowExec: true,
    })

    expect(tasks(result).map((t) => t.path[2])).toEqual(['test'])
    const diags = diagnostics(result).filter((d) => d.runner === 'rake')
    expect(diags.some((d) => d.message.includes('no task lines'))).toBe(true)
  })

  test('prose printed during evaluation is not mistaken for a task', async () => {
    const dir = await root({ Rakefile: DYNAMIC_RAKEFILE })
    const { options } = opts(
      [
        {
          binary: 'rake',
          argv: ['-AT'],
          stdout: ['booting the app # this is not a task', 'rake test  # Run the test suite'].join(
            '\n',
          ),
        },
      ],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const found = tasks(await collect(dir, { ...options, tools: [rake], allowExec: true }))

    expect(found.map((t) => t.path[2])).toEqual(['test'])
  })

  test('declared arguments become parameters and stay out of argv', async () => {
    const dir = await root({ Rakefile: 'task :release do\nend\n' })
    const { options } = opts(
      [{ binary: 'rake', argv: ['-AT'], stdout: 'rake release[lib,bump]  # Release a library' }],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const found = tasks(await collect(dir, { ...options, tools: [rake], allowExec: true }))
    const release = found.find((t) => t.path[2] === 'release')!

    expect(release.argv).toEqual(['rake', 'release'])
    expect(release.display).toBe('rake release[lib,bump]')
    expect(release.parameters).toEqual([
      { name: 'lib', required: false, variadic: false },
      { name: 'bump', required: false, variadic: false },
    ])
  })

  test('a .rake file the root Rakefile loaded is not double-reported', async () => {
    const dir = await root({
      Rakefile: 'Dir.glob("lib/tasks/**/*.rake").each { |r| load r }\n',
      'lib/tasks/extra.rake': 'desc "An extra loaded task"\ntask :extra do\nend\n',
    })
    const { options } = opts(
      [{ binary: 'rake', argv: ['-AT'], stdout: 'rake extra  # An extra loaded task' }],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const found = tasks(await collect(dir, { ...options, tools: [rake], allowExec: true }))

    expect(found.map((t) => t.path[2])).toEqual(['extra'])
    // rake's own listing wins: it addresses the task the way rake runs it.
    expect(found[0]?.argv).toEqual(['rake', 'extra'])
    expect(found[0]?.source).toBe('Rakefile')
  })

  test('an unloaded .rake file keeps a task whose name collides with a root task', async () => {
    // Dedup must compare tasks, not bare names. This file's `test` and the root
    // Rakefile's `test` are different tasks, with different argv, id and source.
    // Turning execution on must never make the list shorter than the parse path.
    const dir = await root({
      Rakefile: 'desc "Run the test suite"\ntask :test do\nend\n',
      'tools/plugin/tasks.rake':
        'require "rake/testtask"\n\ntask :test do\nend\n\ntask :unique do\nend\n\nRake::TestTask.new(:plugin_spec)\n',
    })
    const { options } = opts(
      [{ binary: 'rake', argv: ['-AT'], stdout: 'rake test  # Run the test suite' }],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )

    const floor = tasks(await collect(dir, { ...options, tools: [rake] }))
    const result = await collect(dir, { ...options, tools: [rake], allowExec: true })
    const upgraded = tasks(result)

    expect(floor.length).toBe(3)
    expect(upgraded.length).toBeGreaterThanOrEqual(floor.length)
    expect(upgraded.map((t) => t.display).sort()).toEqual([
      'rake -C tools/plugin test',
      'rake -C tools/plugin unique',
      'rake test',
    ])
    // rake never evaluated this file, so the parser's limit still applies to it.
    expect(
      diagnostics(result).some(
        (d) =>
          d.source === 'tools/plugin/tasks.rake' && d.message.includes('invisible to a parser'),
      ),
    ).toBe(true)
  })

  test('a subdirectory Rakefile stays on the parse path — the root invocation never loaded it', async () => {
    const dir = await root({
      Rakefile: 'task :test do\nend\n',
      'sub/Rakefile': 'task :build do\nend\n',
    })
    const { options } = opts(
      [{ binary: 'rake', argv: ['-AT'], stdout: 'rake test  # Run the test suite' }],
      { which: fakeWhich({ rake: '/usr/bin/rake' }) },
    )
    const found = tasks(await collect(dir, { ...options, tools: [rake], allowExec: true }))

    expect(found.map((t) => t.path[2]).sort()).toEqual(['build', 'test'])
    expect(found.find((t) => t.path[2] === 'build')?.argv).toEqual(['rake', '-C', 'sub', 'build'])
  })

  test('no Rakefile at the root means no invocation at all', async () => {
    const dir = await root({ 'sub/Rakefile': 'task :build do\nend\n' })
    const { options, calls } = opts(CANNED_LISTING, {
      which: fakeWhich({ rake: '/usr/bin/rake' }),
    })
    const result = await collect(dir, {
      ...options,
      tools: [rake],
      allowExec: true,
    })

    expect(tasks(result).map((t) => t.path[2])).toEqual(['build'])
    expect(calls.filter((c) => c.binary === 'rake')).toEqual([])
    expect(
      diagnostics(result).some((d) => d.message.includes('no Rakefile at the catalog root')),
    ).toBe(true)
  })
})
