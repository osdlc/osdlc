/**
 * The root import stays light: nothing it reaches may load config-layers'
 * barrel (and through it yaml and zod). A CLI pays this on every run.
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

/** Every package specifier (not relative) imported by `src/` files reachable from `entry`. */
function packageSpecifiers(entry: string): Set<string> {
  const program = ts.createProgram([join(SRC, entry)], COMPILER_OPTIONS)
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
