import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { instructionFiles } from '../../src/providers/instruction-files.ts'
import { selectByScope } from '../../src/select.ts'
import type { RuleSource } from '../../src/types.ts'

let root: string
let outside: string

/** Write a file, creating parents. */
async function put(rel: string, body: string): Promise<void> {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, body, 'utf8')
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'rule-review-instr-'))

  await put('CLAUDE.md', 'Root rule: never commit secrets.')
  await put('docs/CLAUDE.md', 'Docs rule: sentence case headings.')
  await put('apps/web/src/AGENTS.md', 'Web rule: no inline handlers.')
  await put('app/(auth)/[id]/+(x)/CLAUDE.md', 'Odd rule: directory names are literal.')

  // A pointer file — no rules of its own, redirects to a sibling README.
  await put('apps/api/CLAUDE.md', 'See @./README.md for the rules.')
  await put('apps/api/README.md', 'API rule: every endpoint is versioned.')

  // A cycle, to prove the walk terminates.
  await put('cyc/CLAUDE.md', 'Cyclic: @./other.md')
  await put('cyc/other.md', 'Back again: @./CLAUDE.md')

  // An import that tries to climb out of the repo.
  await put('escape/CLAUDE.md', 'Escape: @../../../../etc/hosts')

  // An import through a symlink that points outside the repo.
  outside = await mkdtemp(join(tmpdir(), 'rule-review-outside-'))
  await writeFile(join(outside, 'secret.md'), 'Outside secret: must not enter a prompt.')
  await symlink(outside, join(root, 'k'))
  await put('linked/CLAUDE.md', 'Linked: @../k/secret.md')

  // A symlink that stays inside the repo.
  await symlink(join(root, 'docs'), join(root, 'docs-link'))
  await put('inlink/CLAUDE.md', 'Inlink: @../docs-link/CLAUDE.md')

  // A tracked instruction file that is itself a symlink to a file outside the repo.
  await mkdir(join(root, 'toplink'), { recursive: true })
  await writeFile(join(outside, 'top-secret.md'), 'Top-level outside secret.')
  await symlink(join(outside, 'top-secret.md'), join(root, 'toplink/CLAUDE.md'))

  // An import of a file whose name starts with two dots.
  await put('dotdot/CLAUDE.md', 'See @..notes.md')
  await put('dotdot/..notes.md', 'Dotdot rule.')

  // An absolute import spelled through a symlink to the project root.
  const alias = join(outside, 'root-alias')
  await symlink(root, alias)
  await put('abs/CLAUDE.md', `See @${alias}/docs/CLAUDE.md`)

  await put('empty/CLAUDE.md', '   \n\n  ')
  await put('node_modules/pkg/CLAUDE.md', 'Vendored: should never be read.')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

/** The fixture tree is not a git repo, so enumerate it directly. */
const listFixture = (): string[] => [
  'CLAUDE.md',
  'docs/CLAUDE.md',
  'apps/web/src/AGENTS.md',
  'app/(auth)/[id]/+(x)/CLAUDE.md',
  'apps/api/CLAUDE.md',
  'cyc/CLAUDE.md',
  'escape/CLAUDE.md',
  'linked/CLAUDE.md',
  'toplink/CLAUDE.md',
  'dotdot/CLAUDE.md',
  'abs/CLAUDE.md',
  'inlink/CLAUDE.md',
  'empty/CLAUDE.md',
]

async function discover(): Promise<RuleSource[]> {
  return instructionFiles({ list: listFixture }).discover({
    projectRoot: root,
    changedFiles: [],
  })
}

function byPath(sources: RuleSource[], path: string): RuleSource {
  const found = sources.find((s) => s.path === path)
  if (found === undefined) throw new Error(`no source at ${path}`)
  return found
}

describe('instructionFiles', () => {
  test('scopes the root file to the whole repo at depth 0', async () => {
    const root0 = byPath(await discover(), 'CLAUDE.md')

    expect(root0.patterns).toEqual(['**'])
    expect(root0.depth).toBe(0)
    expect(root0.label).toBe('CLAUDE.md (repo root)')
  })

  test('a directory named with glob characters scopes to itself, not a pattern', async () => {
    const odd = byPath(await discover(), 'app/(auth)/[id]/+(x)/CLAUDE.md')
    const dir = 'app/(auth)/[id]/+(x)'

    const { covered } = selectByScope(
      [{ id: odd.id, patterns: odd.patterns }],
      [`${dir}/a.ts`, 'app/(auth)/i/x/a.ts'],
      [],
    )

    expect(covered.get(odd.id)).toEqual([`${dir}/a.ts`])
  })

  test('scopes a nested file to its own subtree', async () => {
    const web = byPath(await discover(), 'apps/web/src/AGENTS.md')

    expect(web.patterns).toEqual(['apps/web/src/**'])
    expect(web.depth).toBe(3)
    expect(web.kind).toBe('instruction')
  })

  test('finds AGENTS.md as well as CLAUDE.md', async () => {
    const paths = (await discover()).map((s) => s.path)

    expect(paths).toContain('apps/web/src/AGENTS.md')
    expect(paths).toContain('CLAUDE.md')
  })

  test('inlines an @path import so a pointer file carries real rules', async () => {
    const api = byPath(await discover(), 'apps/api/CLAUDE.md')

    expect(api.text).toContain('API rule: every endpoint is versioned.')
    // Attribution is kept so the judge cannot misattribute borrowed prose.
    expect(api.text).toContain('imported from apps/api/README.md')
  })

  test('import resolution terminates on a cycle', async () => {
    const cyc = byPath(await discover(), 'cyc/CLAUDE.md')

    expect(cyc.text).toContain('Back again')
    expect(cyc.text.match(/imported from/g) ?? []).toHaveLength(1)
  })

  test('refuses an import that escapes the project root', async () => {
    const escape = byPath(await discover(), 'escape/CLAUDE.md')

    expect(escape.text).not.toContain('imported from')
  })

  test('refuses an import through a symlink that leaves the project root', async () => {
    const linked = byPath(await discover(), 'linked/CLAUDE.md')

    expect(linked.text).not.toContain('Outside secret')
    expect(linked.text).not.toContain('imported from')
  })

  test('does not read a top-level instruction file that is a symlink out of the root', async () => {
    const sources = await discover()

    expect(sources.map((s) => s.path)).not.toContain('toplink/CLAUDE.md')
    expect(sources.some((s) => s.text.includes('Top-level outside secret'))).toBe(false)
  })

  test('inlines an import whose file name starts with two dots', async () => {
    expect(byPath(await discover(), 'dotdot/CLAUDE.md').text).toContain('Dotdot rule.')
  })

  test('follows an absolute import spelled through a symlinked project root', async () => {
    expect(byPath(await discover(), 'abs/CLAUDE.md').text).toContain(
      'Docs rule: sentence case headings.',
    )
  })

  test('still follows a symlink that stays inside the project root', async () => {
    const inlink = byPath(await discover(), 'inlink/CLAUDE.md')

    expect(inlink.text).toContain('Docs rule: sentence case headings.')
  })

  test('maxImportDepth 0 disables resolution entirely', async () => {
    const sources = await instructionFiles({ list: listFixture, maxImportDepth: 0 }).discover({
      projectRoot: root,
      changedFiles: [],
    })

    expect(byPath(sources, 'apps/api/CLAUDE.md').text).not.toContain('every endpoint is versioned')
  })

  test('skips a file with no rules in it', async () => {
    expect((await discover()).map((s) => s.path)).not.toContain('empty/CLAUDE.md')
  })

  test('a path the lister names but disk does not is dropped, not thrown on', async () => {
    const sources = await instructionFiles({
      list: () => ['CLAUDE.md', 'deleted/CLAUDE.md'],
    }).discover({ projectRoot: root, changedFiles: [] })

    expect(sources.map((s) => s.path)).toEqual(['CLAUDE.md'])
  })

  test('duplicates from the lister collapse to one source', async () => {
    // The default lister concatenates tracked and untracked results, so a
    // repeat is possible; a duplicate id would abort the whole registry.
    const sources = await instructionFiles({
      list: () => ['CLAUDE.md', 'CLAUDE.md'],
    }).discover({ projectRoot: root, changedFiles: [] })

    expect(sources).toHaveLength(1)
  })

  test('ids are unique, so the registry accepts the whole set', async () => {
    const ids = (await discover()).map((s) => s.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('sibling instruction files that carry the same rules', () => {
  let dup: string

  beforeAll(async () => {
    dup = await mkdtemp(join(tmpdir(), 'rule-review-instr-dup-'))
    const at = async (rel: string, body: string): Promise<void> => {
      await mkdir(dirname(join(dup, rel)), { recursive: true })
      await writeFile(join(dup, rel), body, 'utf8')
    }
    // The common setup: CLAUDE.md is a symlink to AGENTS.md.
    await at('AGENTS.md', '- Never use any.')
    await symlink(join(dup, 'AGENTS.md'), join(dup, 'CLAUDE.md'))
    // The pointer form: a CLAUDE.md whose whole body imports its sibling.
    await at('ptr/AGENTS.md', '- Pointer rule.')
    await at('ptr/CLAUDE.md', '@AGENTS.md')
    // A CLAUDE.md that adds its own rules on top of its sibling's.
    await at('more/AGENTS.md', '- Shared rule.')
    await at('more/CLAUDE.md', '- Own rule.\n@AGENTS.md')
    // Two siblings with different rules both stay.
    await at('both/AGENTS.md', '- Agents rule.')
    await at('both/CLAUDE.md', '- Claude rule.')
    // A sibling whose text merely contains the other's words is not a copy.
    await at('narrow/AGENTS.md', '- Never use any')
    await at('narrow/CLAUDE.md', '- Never use any in tests only.')
  })

  afterAll(async () => {
    await rm(dup, { recursive: true, force: true })
  })

  async function paths(): Promise<string[]> {
    const sources = await instructionFiles({
      list: () => [
        'AGENTS.md',
        'CLAUDE.md',
        'ptr/AGENTS.md',
        'ptr/CLAUDE.md',
        'more/AGENTS.md',
        'more/CLAUDE.md',
        'both/AGENTS.md',
        'both/CLAUDE.md',
        'narrow/AGENTS.md',
        'narrow/CLAUDE.md',
      ],
    }).discover({ projectRoot: dup, changedFiles: [] })
    return sources.map((s) => s.path)
  }

  test('a CLAUDE.md symlinked to AGENTS.md is one source, not two', async () => {
    const found = await paths()

    expect(found).toContain('AGENTS.md')
    expect(found).not.toContain('CLAUDE.md')
  })

  test('a sibling whose rules another already inlines is not its own source', async () => {
    const found = await paths()

    expect(found.filter((p) => p.startsWith('ptr/'))).toHaveLength(1)
    expect(found).toContain('more/CLAUDE.md')
    expect(found).not.toContain('more/AGENTS.md')
  })

  test('siblings with different rules both stay', async () => {
    expect((await paths()).filter((p) => p.startsWith('both/'))).toEqual([
      'both/AGENTS.md',
      'both/CLAUDE.md',
    ])
  })

  test('a sibling that only contains the same words is not dropped', async () => {
    expect((await paths()).filter((p) => p.startsWith('narrow/'))).toEqual([
      'narrow/AGENTS.md',
      'narrow/CLAUDE.md',
    ])
  })
})
