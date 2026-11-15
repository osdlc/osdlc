import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { test } from 'vitest'

import { OSDLC, packageDirs } from '@osdlc/package-checks'

test('a package named by a relative root and folder matches its listed copy', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'package-checks-dirs-')))
  try {
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, 'libs', name), { recursive: true })
      writeFileSync(join(root, 'libs', name, 'package.json'), '{}')
    }
    mkdirSync(join(root, 'libs', 'not-a-package'))
    const settings = { ...OSDLC, tsDir: 'libs' }
    const rel = relative(process.cwd(), root)
    const { all, picked } = packageDirs(rel, ['libs/a', './libs/a/'], settings)
    assert.deepEqual(all, [join(root, 'libs/a'), join(root, 'libs/b')])
    assert.deepEqual(picked, [join(root, 'libs/a')])
    assert.deepEqual(packageDirs(root, [], settings).picked, all)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
