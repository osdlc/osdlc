import assert from 'node:assert/strict'
import { symlinkSync } from 'node:fs'
import { describe, test } from 'vitest'

import { loadCorpus } from '../src/load.ts'
import { runRules } from '../src/rules.ts'
import { scratch } from './corpora.ts'

const { at, put, root } = scratch('rules')

/** A package `name` with a corpus root and a rules module whose text is `body`. */
const profile = (name: string, body: string, rules = './rules.mjs', extra = ''): void => {
  const dir = `c/node_modules/${name}`
  put(`${dir}/package.json`, JSON.stringify({ name, 'corpus-schema': { rules } }))
  root(dir, { extra })
  put(`${dir}/rules.mjs`, body)
}
const run = (extendsMap: Record<string, string> = { p: 'p' }) => {
  root('c', { extends: extendsMap })
  return runRules(loadCorpus(at('c')))
}

describe('profile rules', () => {
  test('an extended package`s rules run and report errors and warnings', async () => {
    profile(
      'p',
      `export const check = (c) => [
        { file: 'a.md', field: 'x', message: 'bad' },
        { file: 'b.md', field: 'y', message: 'meh', severity: 'warning' },
      ]`,
    )
    assert.deepEqual(await run(), { errors: ['a.md: x: bad'], warnings: ['b.md: y: meh'] })
  })

  test('rules of a parent`s parent run too, each module once', async () => {
    profile('p', `export const check = () => [{ file: 'p', field: 'f', message: 'p' }]`)
    root('c/node_modules/p/node_modules/q', {})
    put(
      'c/node_modules/p/node_modules/q/package.json',
      '{"name":"q","corpus-schema":{"rules":"./r.mjs"}}',
    )
    put(
      'c/node_modules/p/node_modules/q/r.mjs',
      `export const check = () => [{ file: 'q', field: 'f', message: 'q' }]`,
    )
    root('c/node_modules/p', { extends: { q: 'q' } })
    assert.deepEqual((await run()).errors.sort(), ['p: f: p', 'q: f: q'])
  })

  test('the rules receive the corpus being validated', async () => {
    profile('p', `export const check = (c) => [{ file: c.name, field: 'f', message: 'seen' }]`)
    assert.deepEqual((await run()).errors, ['c: f: seen'])
  })

  test('a corpus`s own rules and a referenced corpus`s rules never run', async () => {
    profile('p', `export const check = () => [{ file: 'x', field: 'f', message: 'ran' }]`)
    root('c', { references: { p: 'p' } })
    assert.deepEqual(await runRules(loadCorpus(at('c'))), { errors: [], warnings: [] })
    put('c/package.json', '{"name":"c","corpus-schema":{"rules":"./r.mjs"}}')
    put('c/r.mjs', `export const check = () => [{ file: 'x', field: 'f', message: 'ran' }]`)
    assert.deepEqual(await runRules(loadCorpus(at('c'))), { errors: [], warnings: [] })
  })

  test('a package with no rules adds nothing', async () => {
    root('c/node_modules/p', {})
    put('c/node_modules/p/package.json', '{"name":"p"}')
    assert.deepEqual(await run(), { errors: [], warnings: [] })
  })

  test('each broken rules module is an error, not an exception', async () => {
    const cases: [string, string, string, string][] = [
      ['throws', `export const check = () => { throw new Error('boom') }`, './rules.mjs', 'boom'],
      ['no check', `export const x = 1`, './rules.mjs', 'exports no check function'],
      ['bad shape', `export const check = () => [{ file: 1 }]`, './rules.mjs', 'array of problems'],
      ['missing', ``, './gone.mjs', 'does not exist'],
      ['not a path', ``, 'rules.mjs', 'must be a path starting ./'],
      ['outside', ``, './../../../../x.mjs', 'does not exist'],
    ]
    for (const [i, [name, body, rules, want]] of cases.entries()) {
      // Node caches an imported module by its URL, so each case gets its own file.
      const file = rules === './rules.mjs' ? `./rules${i}.mjs` : rules
      profile('p', '', file)
      if (rules === './rules.mjs') put(`c/node_modules/p/${file}`, body)
      const r = await run()
      assert.equal(r.errors.length, 1, name)
      assert.match(r.errors[0] as string, new RegExp(`^\\.: \\(rules\\): p: .*${want}`), name)
    }
  })

  test('a rules module that is a link out of the package is refused', async () => {
    put('outside.mjs', `export const check = () => []`)
    profile('p', ``, './link.mjs')
    symlinkSync(at('outside.mjs'), at('c/node_modules/p/link.mjs'))
    const r = await run()
    assert.match(r.errors[0] as string, /outside its package/)
  })
})
