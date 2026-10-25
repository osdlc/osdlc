/**
 * The web view's script runs in a browser, so nothing it imports may need
 * Node. It imports modules from `src/` (`groups.ts`, `args.ts`,
 * `vocabulary.ts`, `core/filter.ts`), and this test fails as soon as one of
 * them pulls in a Node built-in.
 */

import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

import { rolldown } from 'rolldown'
import { describe, expect, test } from 'vitest'

const NODE = new Set(builtinModules)

/** Every Node built-in the bundle of `entry` imports. */
async function nodeImports(entry: string): Promise<string[]> {
  const external = new Set<string>()
  const bundle = await rolldown({
    input: entry,
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'record-node-builtins',
        resolveId(id) {
          if (id.startsWith('node:') || NODE.has(id) || NODE.has(id.split('/')[0]!)) {
            external.add(id)
            return { id, external: true }
          }
          return null
        },
      },
    ],
  })
  try {
    // What the shipped script still imports after tree-shaking.
    const { output } = await bundle.generate({ format: 'esm' })
    return output
      .flatMap((chunk) => ('imports' in chunk ? chunk.imports : []))
      .filter((id) => external.has(id))
      .sort()
  } finally {
    await bundle.close()
  }
}

const src = (path: string): string => fileURLToPath(new URL(`../src/${path}`, import.meta.url))

describe('the web bundle', () => {
  test('imports no Node built-in', async () => {
    expect(await nodeImports(src('web/main.ts'))).toEqual([])
  }, 30_000)

  test('the browser-safe core modules import none either', async () => {
    for (const path of [
      'vocabulary.ts',
      'core/filter.ts',
      'core/unknowns.ts',
      'schema.ts',
      'keys.ts',
      'config-keys.ts',
    ]) {
      expect(await nodeImports(src(path)), path).toEqual([])
    }
  }, 30_000)

  test('the check sees a Node import when there is one', async () => {
    expect(await nodeImports(src('core/run.ts'))).toContain('node:os')
  }, 30_000)
})
