import { expect, test } from 'vitest'

import { runApp } from '../../src/testing.ts'
import { fixture } from './fixture.ts'

test('explain: the highest layer that sets the key wins', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'discovery', '--json'])
  expect(run.exit).toBe(0)
  expect(run.json()).toEqual({
    schemaVersion: 1,
    kind: 'config-explain',
    key: 'discovery',
    value: 'git',
    source: 'project',
    reason: 'project is the highest layer that sets it',
    layers: [
      { layer: 'default', set: true, value: 'auto', allowed: true, won: false },
      { layer: 'user', set: false, allowed: true, won: false, file: '/u.json' },
      { layer: 'project', set: true, value: 'git', allowed: true, won: true, file: '/p.json' },
      { layer: 'env', set: false, allowed: true, won: false, envVar: 'T_DISCOVERY' },
      { layer: 'flag', set: false, allowed: true, won: false },
    ],
  })
})

test('explain: an environment variable beats the files', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'discovery', '--json'], {
    env: { T_DISCOVERY: 'off' },
  })
  expect(run.json()).toMatchObject({ value: 'off', source: 'env' })
})

test('explain: a layer that may not set the key is ignored, and the reason says so', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'trust.paths', '--json'])
  const doc = run.json<{ source: string; value: unknown; reason: string; layers: unknown[] }>()
  expect(doc.source).toBe('user')
  expect(doc.value).toEqual(['/home/**'])
  expect(doc.reason).toBe(
    'user is the highest layer allowed to set it; project is ignored (a project file may not set it)',
  )
  expect(doc.layers[2]).toMatchObject({ layer: 'project', set: true, allowed: false, won: false })
})

test('explain: the text form marks the winner and the ignored layer', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'trust.paths'])
  expect(run.out).toBe(
    'trust.paths = ["/home/**"]  (user is the highest layer allowed to set it; project is ignored (a project file may not set it))\n' +
      '  default  []            overridden\n' +
      '  user     ["/home/**"]  wins\n' +
      '  project  ["/**"]       ignored: a project file may not set it\n' +
      '  env      -\n' +
      '  flag     -\n',
  )
})

test('explain: no layer setting the key prints the answer and exits 1', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'extra', '--json'])
  expect(run.exit).toBe(1)
  const doc = run.json()
  expect(doc).toMatchObject({ key: 'extra', source: null, reason: 'no layer sets it' })
  expect('value' in doc).toBe(false)
})

test('explain: an unknown key is a usage error with a did-you-mean', async () => {
  const { app } = fixture()
  const run = await runApp(app, ['config', 'explain', 'discovry'])
  expect(run.exit).toBe(2)
  expect(run.err).toContain('unknown setting discovry; did you mean discovery?')
})

test('explain is there only when the store can explain', async () => {
  const { app } = fixture()
  expect(app.paths().map((p) => p.join(' '))).toContain('config explain')
})

test('explain: when only a layer that may not set the key sets it, the reason says so', async () => {
  const { configCommands } = await import('../../src/config-command.ts')
  const { defineApp } = await import('../../src/command/index.ts')
  const app = defineApp({
    name: 't',
    version: '0',
    summary: 's',
    commands: {
      config: configCommands({
        layers: ['project'],
        defaultLayer: 'project',
        list: async () => ({ settings: [] }),
        locations: async () => [],
        set: async () => ({ file: '', value: null }),
        unset: async () => ({ file: '', removed: false }),
        explain: async () => ({
          layers: [
            { layer: 'default', set: false },
            { layer: 'project', set: true, value: 1, allowed: false, note: 'user only' },
          ],
        }),
      }),
    },
  })
  const run = await runApp(app, ['config', 'explain', 'k', '--json'])
  expect(run.exit).toBe(1)
  expect(run.json()).toMatchObject({
    source: null,
    reason: 'no layer allowed to set it sets it; project is ignored (user only)',
  })
})
