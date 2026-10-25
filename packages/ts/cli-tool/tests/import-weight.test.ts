/**
 * The root import stays light: nothing it reaches may load config-layers'
 * index module (and through it yaml and zod). A CLI pays that load time on
 * every run.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { expect, test } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
}

/** Every package specifier (not relative) imported by the `src/` files reachable from `entry`. */
function packageSpecifiers(...entries: string[]): Set<string> {
  const program = ts.createProgram(
    entries.map((e) => join(SRC, e)),
    COMPILER_OPTIONS,
  )
  const out = new Set<string>()
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(SRC)) continue
    const source = readFileSync(sf.fileName, 'utf-8')
    const parsed = ts.preProcessFile(source, true, true)
    for (const ref of parsed.importedFiles) {
      if (!ref.fileName.startsWith('.') && !ref.fileName.startsWith('node:')) {
        out.add(ref.fileName)
      }
    }
  }
  return out
}

for (const entry of [
  'index.ts',
  'devlink/index.ts',
  'define-cli.ts',
  'io.ts',
  'prompt.ts',
  'exit.ts',
]) {
  test(`${entry} imports only the light config-layers subpaths, never yaml or zod`, () => {
    const heavy = [...packageSpecifiers(entry)].filter(
      (s) =>
        s === 'yaml' ||
        s === 'zod' ||
        (s.startsWith('@osdlc/config-layers') &&
          !['@osdlc/config-layers/dirs', '@osdlc/config-layers/did-you-mean'].includes(s)),
    )
    expect(heavy).toEqual([])
  })
}

test('only the mcp entry loads the MCP SDK', () => {
  const others = packageSpecifiers(
    'index.ts',
    'command/index.ts',
    'config-command.ts',
    'trust-command.ts',
    'guide.ts',
    'testing.ts',
    'http/index.ts',
  )
  expect([...others].filter((s) => s.startsWith('@modelcontextprotocol/'))).toEqual([])
  const mcp = packageSpecifiers('mcp/index.ts')
  expect([...mcp].some((s) => s.startsWith('@modelcontextprotocol/'))).toBe(true)
}, 30_000)

test('the root entry loads only these packages', () => {
  // @osdlc/ux is the color and terminal-text rule; its root import costs a few
  // milliseconds. Anything new here needs the same check.
  expect([...packageSpecifiers('index.ts')].sort()).toEqual([
    '@osdlc/config-layers/did-you-mean',
    '@osdlc/config-layers/dirs',
    '@osdlc/result',
    '@osdlc/ux',
    'commander',
  ])
})
