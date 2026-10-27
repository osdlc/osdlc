import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { cargo, cargoAliases } from '../src/plugins/rust/index.ts'

const TOOLS = [cargo, cargoAliases]

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
async function run(
  files: Record<string, string>,
  tools: readonly ToolDef[] = TOOLS,
  which: Record<string, string> = {},
) {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return detectAndCollect(dir, { discovery: 'walk', tools, which: fakeWhich(which) })
}

function named(list: Task[], name: string): Task {
  const task = list.find((t) => t.path[t.path.length - 1] === name)
  if (task === undefined) throw new Error(`no task ${name}`)
  return task
}

const aliases = (dir: string, list: Task[]) =>
  list.filter((t) => t.runner === 'cargo-aliases' && t.cwd === dir).map((t) => t.path[2])

describe('cargo-aliases runner', () => {
  test('lists the [alias] table, xtask included, for the crate', async () => {
    const { catalog } = await run({
      'Cargo.toml': '[package]\nname = "app"\n',
      '.cargo/config.toml': [
        '[alias]',
        'xtask = "run --package xtask --"',
        'rr = ["run", "--release"]',
        'b = "build"',
        '',
      ].join('\n'),
    })
    const found = tasks(catalog).filter((t) => t.runner === 'cargo-aliases')
    expect(found.map((t) => t.path[2])).toEqual(['b', 'rr', 'xtask'])
    expect(named(found, 'xtask')).toMatchObject({
      argv: ['cargo', 'xtask'],
      cwd: '.',
      source: '.cargo/config.toml',
      detail: 'cargo run --package xtask --',
      origin: 'declared',
    })
    expect(named(found, 'rr').detail).toBe('cargo run --release')
  })

  test('arguments are appended', async () => {
    const { project, catalog } = await run({
      'Cargo.toml': '[package]\nname = "app"\n',
      '.cargo/config.toml': '[alias]\nxtask = "run --package xtask --"\n',
    })
    const xtask = named(tasks(catalog), 'xtask')
    expect(project.runners.invoke(xtask, ['dist', '--release'])).toEqual([
      'cargo',
      'xtask',
      'dist',
      '--release',
    ])
  })

  test('merges configs from the crate up to the root, the deeper one winning', async () => {
    const { catalog } = await run({
      '.cargo/config.toml': '[alias]\nlint = "clippy"\nci = "test"\n',
      'rust/Cargo.toml': '[package]\nname = "app"\n',
      'rust/.cargo/config.toml': '[alias]\nci = "test --all"\n',
    })
    const found = tasks(catalog)
    expect(aliases('rust', found)).toEqual(['ci', 'lint'])
    expect(named(found, 'ci')).toMatchObject({
      detail: 'cargo test --all',
      source: 'rust/.cargo/config.toml',
    })
    expect(named(found, 'lint').source).toBe('.cargo/config.toml')
  })

  test('lists a workspace once, at its root, and prefers .cargo/config to config.toml', async () => {
    const { catalog } = await run({
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      '.cargo/config': '[alias]\nold = "build"\n',
      '.cargo/config.toml': '[alias]\nnew = "build"\n',
    })
    const found = tasks(catalog).filter((t) => t.runner === 'cargo-aliases')
    expect(found.map((t) => [t.cwd, t.path[2]])).toEqual([['.', 'old']])
  })

  test('a crate the workspace excludes is its own project and gets the aliases above it', async () => {
    const { catalog } = await run({
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\nexclude = ["tools"]\n',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      'tools/gen/Cargo.toml': '[package]\nname = "gen"\n',
      '.cargo/config.toml': '[alias]\nxtask = "run -p xtask"\n',
    })
    const found = tasks(catalog).filter((t) => t.runner === 'cargo-aliases')
    expect(found.map((t) => [t.cwd, t.path[2]])).toEqual([
      ['.', 'xtask'],
      ['tools/gen', 'xtask'],
    ])
  })

  test('a crate an inner workspace excludes but an outer one lists is a member of the outer', async () => {
    const { catalog } = await run({
      'Cargo.toml': '[workspace]\nmembers = ["inner/tools/gen"]\n',
      'inner/Cargo.toml': '[workspace]\nexclude = ["tools"]\n',
      'inner/tools/gen/Cargo.toml': '[package]\nname = "gen"\n',
      '.cargo/config.toml': '[alias]\nxtask = "run -p xtask"\n',
    })
    const found = tasks(catalog).filter((t) => t.runner === 'cargo-aliases')
    expect(found.map((t) => t.cwd)).not.toContain('inner/tools/gen')
    expect(found.map((t) => t.cwd)).toContain('.')
  })

  test('an alias over a built-in command, a bad alias and bad TOML are diagnostics', async () => {
    const { catalog } = await run({
      'Cargo.toml': '[package]\nname = "app"\n',
      '.cargo/config.toml': '[alias]\nbuild = "check"\nbad = 3\nok = "check"\n',
      'b/Cargo.toml': '[package]\nname = "b"\n',
      'b/.cargo/config.toml': '[alias\n',
    })
    const report = catalog.reports.find((r) => r.runner === 'cargo-aliases')!
    const messages = report.diagnostics.map((d) => d.message)
    expect(messages).toContainEqual(expect.stringMatching(/^parse failed/))
    expect(messages).toContainEqual(expect.stringMatching(/alias bad is not/))
    expect(messages.filter((m) => /built-in/.test(m))).toHaveLength(1)
    expect(aliases('.', tasks(catalog))).toEqual(['ok'])
  })

  test("built-ins are cargo's own list: clippy, fmt and miri aliases are kept", async () => {
    const { catalog } = await run({
      'Cargo.toml': '[package]\nname = "app"\n',
      '.cargo/config.toml':
        '[alias]\nclippy = "clippy -- -D warnings"\nfmt = "fmt --all"\nmiri = "miri test"\nread-manifest = "x"\ngit-checkout = "y"\n',
    })
    expect(aliases('.', tasks(catalog))).toEqual(['clippy', 'fmt', 'miri'])
    const report = catalog.reports.find((r) => r.runner === 'cargo-aliases')!
    expect(report.diagnostics.filter((d) => /built-in/.test(d.message))).toHaveLength(2)
  })

  test('absent without a .cargo config', async () => {
    const { profile, catalog } = await run({ 'Cargo.toml': '[package]\nname = "app"\n' })
    expect(profile.tools).toEqual(['cargo'])
    expect(catalog.reports.map((r) => r.runner)).not.toContain('cargo-aliases')
  })
})
