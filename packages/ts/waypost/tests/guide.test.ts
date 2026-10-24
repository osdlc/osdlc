/**
 * The `guide` command, checked against the CLI. The derived suite is in
 * `guide-support.ts`; what is asserted here is the extend example and the
 * surface only the interactive tool has.
 */

import { readFile } from 'node:fs/promises'

import { captureIo } from '@osdlc/cli-tool'
import { describe, expect, test } from 'vitest'

import { GUIDE_TOOL, main } from '../src/cli.ts'
import { EXTEND_EXAMPLE, guideSection } from '../src/guide.ts'
import { loadToolModule } from '../src/tools.ts'
import { guideSuite } from './guide-support.ts'

guideSuite(GUIDE_TOOL, main)

async function guide(topic: string): Promise<{ code: number; out: string }> {
  const io = captureIo()
  const code = await main(['guide', topic], {}, '/nonexistent-home', io)
  return { code, out: io.out }
}

describe('the extend example', () => {
  test('is byte-identical to the module the typechecker compiles', async () => {
    const file = await readFile(new URL('./guide-example.ts', import.meta.url), 'utf8')
    const region = file.match(/\/\/ GUIDE-EXAMPLE-START\n([\s\S]*?)\/\/ GUIDE-EXAMPLE-END/)
    expect(region).not.toBeNull()
    expect((region as RegExpMatchArray)[1]!.trim()).toBe(EXTEND_EXAMPLE.trim())
  })

  test('is what the extend section prints', () => {
    expect(guideSection('extend', GUIDE_TOOL)).toContain(EXTEND_EXAMPLE.trim())
  })

  test('loads as a tool module', async () => {
    const tools = await loadToolModule(new URL('./guide-example.ts', import.meta.url).pathname)
    expect(tools.map((t) => t.id)).toEqual(['acme'])
  })
})

describe('the interactive surface', () => {
  test('usage names the terminal UI, --serve and the allowExec default', async () => {
    const ran = await guide('usage')
    expect(ran.code).toBe(0)
    expect(ran.out).toContain('--serve')
    expect(ran.out).toContain('terminal UI')
    expect(ran.out).toContain('allowExec: true')
  })

  test('extend names --config, which the parser takes', async () => {
    const ran = await guide('extend')
    expect(ran.out).toContain('--config')
  })

  test('usage names every row group', async () => {
    const ran = await guide('usage')
    for (const group of ['Tasks', 'Dependencies', 'Tools', 'Git hooks']) {
      expect(ran.out).toContain(group)
    }
  })
})
