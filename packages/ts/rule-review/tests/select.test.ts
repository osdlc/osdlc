import { describe, expect, test } from 'vitest'

import { escapeGlob, ScopeError, selectByScope } from '../src/select.ts'

describe('selectByScope', () => {
  test('maps each entry to its matching files in changeset order', () => {
    const { covered, unmatched } = selectByScope(
      [
        { id: 'src', patterns: ['src/**'] },
        { id: 'docs', patterns: ['docs/**'] },
        { id: 'all', patterns: ['**'] },
      ],
      ['src/a.ts', 'README.md', 'src/b.ts'],
      [],
    )

    expect(covered.get('src')).toEqual(['src/a.ts', 'src/b.ts'])
    expect(covered.get('all')).toEqual(['src/a.ts', 'README.md', 'src/b.ts'])
    expect(covered.has('docs')).toBe(false)
    expect(unmatched).toEqual(['docs'])
  })

  test('** covers dotfiles and paths under dot-directories', () => {
    const changed = ['.github/workflows/ci.yml', '.gitignore', 'pkg/.eslintrc.json', 'src/a.ts']
    const { covered } = selectByScope(
      [
        { id: 'all', patterns: ['**'] },
        { id: 'pkg', patterns: ['pkg/**'] },
      ],
      changed,
      [],
    )

    expect(covered.get('all')).toEqual(changed)
    expect(covered.get('pkg')).toEqual(['pkg/.eslintrc.json'])
  })

  test('an entry with several patterns matches any of them', () => {
    const { covered } = selectByScope(
      [{ id: 'e', patterns: ['src/**', 'docs/**'] }],
      ['docs/x.md', 'src/y.ts', 'other.txt'],
      [],
    )

    expect(covered.get('e')).toEqual(['docs/x.md', 'src/y.ts'])
  })

  test('exclude patterns drop files before matching', () => {
    const { covered, unmatched } = selectByScope(
      [
        { id: 'e', patterns: ['**'] },
        { id: 'lock', patterns: ['*.lock'] },
      ],
      ['a.ts', 'bun.lock'],
      ['*.lock'],
    )

    expect(covered.get('e')).toEqual(['a.ts'])
    expect(unmatched).toEqual(['lock'])
  })

  test('unmatched keeps entry order; an empty changeset matches nothing', () => {
    const { covered, unmatched } = selectByScope(
      [
        { id: 'b', patterns: ['b/**'] },
        { id: 'a', patterns: ['a/**'] },
      ],
      [],
      [],
    )

    expect(covered.size).toBe(0)
    expect(unmatched).toEqual(['b', 'a'])
  })

  test('a changed path is a literal name, never a pattern', () => {
    const { covered } = selectByScope(
      [
        { id: 'class', patterns: ['pages/[id].vue'] },
        { id: 'literal', patterns: ['pages/\\[id\\].vue'] },
      ],
      ['pages/[id].vue', 'pages/d.vue'],
      [],
    )

    expect(covered.get('literal')).toEqual(['pages/[id].vue'])
    expect(covered.get('class')).toEqual(['pages/d.vue'])
  })

  test('a scope pattern intersect cannot read throws a ScopeError naming the entry', () => {
    const run = () => selectByScope([{ id: 'bad', patterns: ['src/{1..3}.ts'] }], ['src/1.ts'], [])

    expect(run).toThrow(ScopeError)
    expect(run).toThrow(/scope of 'bad'/)
  })

  test('an extglob in exclude throws a ScopeError naming it', () => {
    const run = () => selectByScope([{ id: 'e', patterns: ['**'] }], ['a.ts'], ['!(b).ts'])

    expect(run).toThrow(ScopeError)
    expect(run).toThrow(/^exclude:/)
  })

  test('a duplicate id still throws the registry error, not a ScopeError', () => {
    const run = () =>
      selectByScope(
        [
          { id: 'x', patterns: ['a/**'] },
          { id: 'x', patterns: ['b/**'] },
        ],
        ['a/1'],
        [],
      )

    expect(run).toThrow()
    expect(run).not.toThrow(ScopeError)
  })
})

describe('escapeGlob', () => {
  test('a directory with glob characters scopes to itself only', () => {
    const dir = 'app/(auth)/[id]/+(x)'
    const { covered } = selectByScope(
      [{ id: 'dir', patterns: [`${escapeGlob(dir)}/**`] }],
      [`${dir}/a.ts`, 'app/(auth)/i/x/a.ts'],
      [],
    )

    expect(covered.get('dir')).toEqual([`${dir}/a.ts`])
  })

  test('leaves plain paths unchanged', () => {
    expect(escapeGlob('apps/web/src')).toBe('apps/web/src')
  })
})
