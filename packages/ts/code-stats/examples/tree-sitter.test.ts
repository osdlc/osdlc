import { expect, test } from 'vitest'

import { createScannerRegistry } from '@osdlc/code-stats/scan'
import {
  BUILTIN_GRAMMARS,
  createTreeSitterScanners,
  treeSitterScanner,
} from '@osdlc/code-stats/tree-sitter'

test('the built-in grammars, and the scanners made from the ones that are installed', async () => {
  expect(BUILTIN_GRAMMARS.map((g) => g.id)).toContain('typescript')

  const { scanners, missing, failed } = await createTreeSitterScanners({
    grammars: BUILTIN_GRAMMARS,
  })
  expect(failed).toEqual([])
  expect(scanners.length + missing.length).toBe(BUILTIN_GRAMMARS.length)
  expect(scanners.length).toBeGreaterThan(0)

  // A registry reads the files a scanner matches in place of the built-in table.
  const registry = createScannerRegistry({ scanners })
  const scan = registry.scan('// a\nexport const a = 1\n', 'a.ts')
  expect(scan.kinds).toEqual(['comment', 'logic'])
  expect(scan.reader).toBe('scanner')
})

test('treeSitterScanner is one scanner over one loaded grammar', async () => {
  const { scanners } = await createTreeSitterScanners()
  expect(typeof treeSitterScanner).toBe('function')
  expect(scanners.every((s) => s.id.startsWith('tree-sitter-'))).toBe(true)
})
