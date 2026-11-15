import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'vitest'

import { scratch } from './corpora.ts'

const { put, root, report, errors, warnings } = scratch('uses')

/** A profile `sdlc` with tasks, which need a status, and decisions. */
const profile = (rel = 'sdlc', types = ['tasks', 'decisions']): void => {
  root(rel)
  for (const t of types)
    put(
      `${rel}/${t}/${t}.schema.yaml`,
      'type: object\nrequired: [status]\nproperties:\n  status: { type: string }\n',
    )
}

describe('uses', () => {
  beforeEach(() => profile())

  test('a folder named after a used type, with no schema file, holds its records', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: ['sdlc/tasks', 'sdlc/decisions'] })
    put('c/tasks/T-1.md', '---\nstatus: open\n---\n')
    put('c/decisions/D-1.md', '---\n---\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  task: { type: string, x-ref: sdlc/tasks }\n',
    )
    put('c/notes/N.md', '---\ntask: "[T-1](../tasks/T-1.md)"\n---\n')
    const r = report()
    assert.deepEqual(r.errors, ['decisions/D-1.md: status: required'])
    assert.deepEqual([...(r.records.get('tasks')?.keys() ?? [])], ['T-1'])
  })

  test('a wildcard uses every type of the parent, and a folder that does not exist is fine', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: 'sdlc/*' })
    put('c/tasks/T-1.md', '---\nstatus: open\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual([...r.records.keys()].sort(), ['tasks'])
  })

  test('a used folder that holds a schema file is an error', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: ['sdlc/tasks'] })
    put('c/tasks/tasks.schema.yaml', 'x-extends: sdlc/tasks\n')
    assert.deepEqual(errors(), [
      'tasks/tasks.schema.yaml: (schema): uses names sdlc/tasks, so the folder holds no schema; to add fields, take tasks out of uses and write x-extends here',
    ])
  })

  test('two used types with one name are an error, and neither is used', () => {
    profile('other', ['tasks'])
    root('c', {
      extends: { sdlc: '../sdlc', other: '../other' },
      uses: ['sdlc/*', 'other/tasks'],
    })
    put('c/tasks/T-1.md', '---\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [
      `c.corpus-schema.yaml: uses: "tasks" is both sdlc/* and other/tasks; build the folder's type with x-extends`,
    ])
    assert.ok(!r.records.has('tasks'))
  })

  test('each bad entry is an error', () => {
    root('c', {
      extends: { sdlc: '../sdlc' },
      uses: ['tasks', 'sdlc/missing', 'nope/*'],
    })
    assert.deepEqual(errors(), [
      'c.corpus-schema.yaml: uses: "tasks" names no parent; write <prefix>/<type> or <prefix>/*',
      'c.corpus-schema.yaml: uses: "sdlc/missing" names "sdlc/missing", but sdlc has no such type',
      'c.corpus-schema.yaml: uses: "nope/*" names unknown prefix "nope"; neither extends nor references declares it',
    ])
    root('c', { level: 1, uses: 'sdlc/*' })
    assert.deepEqual(errors(), ['c.corpus-schema.yaml: uses: needs level: 2 in the root file'])
    root('c', { extends: { sdlc: '../sdlc' }, extra: 'uses: 3\n' })
    assert.deepEqual(errors(), [
      'c.corpus-schema.yaml: uses: must be <prefix>/<type>, <prefix>/*, or a list of them',
    ])
  })

  test('only a folder at the corpus root takes a used type; a deeper one is narrative', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: 'sdlc/*' })
    put('c/guides/tasks/X.md', '---\n---\n')
    put('c/guides/decisions/decisions.schema.yaml', 'x-extends: sdlc/decisions\n')
    put('c/guides/decisions/D-1.md', '---\nstatus: kept\n---\n')
    const r = report()
    // A schema file does not make a deeper folder a type either.
    assert.deepEqual(r.errors, [
      'guides/decisions: (folder): a type folder sits at the corpus root only',
    ])
    assert.deepEqual(r.warnings, [])
    assert.deepEqual([...r.records.keys()], [])
  })

  test('a folder inside a type folder stays a plain folder of that type', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: ['sdlc/tasks', 'sdlc/decisions'] })
    put('c/tasks/decisions/T-2.md', '---\nstatus: open\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual([...(r.records.get('tasks')?.keys() ?? [])], ['T-2'])
  })
})

describe('a folder named like a parent type', () => {
  beforeEach(() => profile())

  test('warns when it holds record files and is not in uses', () => {
    root('c', { extends: { sdlc: '../sdlc' }, uses: ['sdlc/decisions'] })
    for (const name of ['tasks', 'task', 'decision-s']) put(`c/${name}/X.md`, 'x\n')
    put('c/tsks/X.md', 'x\n')
    put('c/empty-tasks/README.txt', 'x\n')
    assert.deepEqual(errors(), [])
    assert.deepEqual(warnings().sort(), [
      'decision-s: (folder): named like sdlc/decisions, but has no schema file and is not in uses, so its files are not records',
      'task: (folder): named like sdlc/tasks, but has no schema file and is not in uses, so its files are not records',
      'tasks: (folder): named like sdlc/tasks, but has no schema file and is not in uses, so its files are not records',
      'tsks: (folder): named like sdlc/tasks, but has no schema file and is not in uses, so its files are not records',
    ])
  })

  test('a folder named unlike any parent type is plain narrative', () => {
    root('c', { extends: { sdlc: '../sdlc' } })
    put('c/notes/X.md', 'x\n')
    assert.deepEqual(warnings(), [])
  })
})
