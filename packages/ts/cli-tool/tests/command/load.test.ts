import { join } from 'node:path'

import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  defineApp,
  defineCommand,
  defineGroup,
  loadCommandTree,
  treeFromFiles,
} from '../../src/command/index.ts'
import { runApp } from '../../src/testing.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures')
const cmd = defineCommand({ summary: 'c', output: z.object({}), run: () => ({}) })

describe('loadCommandTree', () => {
  test('the directory tree is the command tree', async () => {
    const tree = await loadCommandTree(new URL('../fixtures/commands/', import.meta.url), {
      summary: 'a tool',
    })
    const app = defineApp({ name: 't', version: '1', summary: 'a tool', commands: tree })
    expect(app.paths()).toEqual([
      [],
      ['config', 'set'],
      ['config', 'get'],
      ['serve'],
      ['help'],
      ['schema'],
    ])
    expect((await runApp(app, ['config', 'get', '--json'])).json()).toMatchObject({
      kind: 'config-get',
      value: 7,
    })
    expect(app.help(['config']).summary).toBe('settings')
    expect(app.help([]).interactive).toBe(true)
  })

  test('two files for one command are refused', async () => {
    await expect(loadCommandTree(join(FIXTURES, 'bad-dup'), { summary: 's' })).rejects.toThrow(
      'declare the same command',
    )
  })

  test('a file without a command default export is refused', async () => {
    await expect(loadCommandTree(join(FIXTURES, 'bad-export'), { summary: 's' })).rejects.toThrow(
      'has no default export',
    )
  })
})

describe('treeFromFiles', () => {
  test('an index command becomes the group default, and a directory without one takes its summary from it', () => {
    const tree = treeFromFiles(
      [
        { path: ['a'], index: true, node: cmd },
        { path: ['a', 'b'], index: false, node: cmd },
      ],
      { summary: 'root' },
    )
    const a = tree.commands['a']!
    expect(a.type).toBe('group')
    expect(a.type === 'group' && a.default).toBe(cmd)
  })

  test('a directory with no summary is refused', () => {
    expect(() =>
      treeFromFiles([{ path: ['a', 'b'], index: false, node: cmd }], { summary: 'root' }),
    ).toThrow('a has no summary; add a/index')
  })

  test('an index group with commands, a file exporting a group, and a file beside a directory are refused', () => {
    const withCommands = defineGroup({ summary: 'g', commands: { x: cmd } })
    expect(() =>
      treeFromFiles([{ path: ['a'], index: true, node: withCommands }], { summary: 'r' }),
    ).toThrow('declares commands')
    expect(() =>
      treeFromFiles([{ path: ['a'], index: false, node: defineGroup({ summary: 'g' }) }], {
        summary: 'r',
      }),
    ).toThrow('exports a group')
    expect(() =>
      treeFromFiles(
        [
          { path: ['a'], index: false, node: cmd },
          { path: ['a', 'b'], index: false, node: cmd },
        ],
        { summary: 'r' },
      ),
    ).toThrow('both a command file and a directory')
    expect(() =>
      treeFromFiles(
        [
          { path: ['a'], index: false, node: cmd },
          { path: ['a'], index: false, node: cmd },
        ],
        { summary: 'r' },
      ),
    ).toThrow('declared twice')
  })
})
