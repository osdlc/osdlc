/** Examples: adding a harness with a provider. */

import { describe, expect, test } from 'vitest'

import {
  builtinProviders,
  detect,
  type DirEntry,
  type HarnessProvider,
  type JsonRead,
  type ProviderContext,
  type ProviderKind,
  type ProviderResult,
  type TextRead,
} from '@osdlc/detect-harness'

describe('providers', () => {
  test('the README example', async () => {
    const mine: HarnessProvider = {
      id: 'mytool',
      label: 'My Tool',
      kind: 'parse',
      binary: 'mytool',
      collect: (ctx) => ({ instructions: [] }),
    }
    await detect({ providers: [...builtinProviders, mine] })

    const catalog = await detect({ providers: [mine], mode: 'project' })
    expect(catalog.reports.map((r) => r.harness)).toEqual(['mytool'])
  })

  test('a provider reads files through its context', async () => {
    const kind: ProviderKind = 'parse'
    const collect = (ctx: ProviderContext): ProviderResult => {
      const config: JsonRead = ctx.readJson(`${ctx.projectRoot}/mytool.json`)
      const notes: TextRead = ctx.readText(`${ctx.projectRoot}/NOTES.md`)
      const entries: DirEntry[] = ctx.listDir(ctx.projectRoot)
      return {
        instructions:
          notes.status === 'parsed' && config.status === 'absent' && entries.length >= 0 ? [] : [],
      }
    }
    const mine: HarnessProvider = { id: 'mytool', label: 'My Tool', kind, collect }
    const catalog = await detect({
      providers: [mine],
      projectRoot: '/path/to/project',
      mode: 'project',
    })
    expect(catalog.reports.map((r) => r.harness)).toEqual(['mytool'])
  })

  test('there is one built-in provider per harness', () => {
    expect(builtinProviders.map((p) => p.id)).toEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
      'pi',
      'antigravity',
    ])
  })
})
