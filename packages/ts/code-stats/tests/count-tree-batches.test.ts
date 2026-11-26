import { spawnRunnerBytes } from '@osdlc/command-seam'
import { expect, test, vi } from 'vitest'

import { countTree } from '../src/measure.ts'
import { testRepo } from './repo-fixture.ts'

const batch = vi.hoisted(() => ({ bytes: undefined as number | undefined }))

vi.mock('../src/git/blobs.ts', async (importOriginal) => {
  const blobs = await importOriginal<typeof import('../src/git/blobs.ts')>()
  return {
    ...blobs,
    streamObjects: (...args: Parameters<typeof blobs.streamObjects>) =>
      blobs.streamObjects(args[0], args[1], args[2], batch.bytes ?? args[3]),
  }
})

test('countTree over many cat-file batches counts what one batch does', () => {
  const r = testRepo()
  r.commit('one', {
    'a.ts': 'export const a = 1\n',
    'b.bin': Buffer.from([0, 1, 2]),
    'copy/a.ts': 'export const a = 1\n',
    'big.txt': 'x'.repeat(500),
    'docs/x.md': '# X\n\ntext\n',
    'src/c.ts': '// c\nexport const c = 3\n',
    'z/a.ts': 'export const a = 1\n',
  })
  let runs = 0
  const real = spawnRunnerBytes('git')
  const gitBytes: typeof real = {
    ...real,
    run: (argv, opts) => {
      if (argv.includes('--batch')) runs += 1
      return real.run(argv, opts)
    },
  }
  const options = { cwd: r.dir, maxBytes: 100, detail: true, runners: { gitBytes } }

  const one = countTree(options)
  expect(runs).toBe(1)

  runs = 0
  batch.bytes = 1
  const many = countTree(options)
  batch.bytes = undefined
  expect(runs).toBe(4)
  expect(many).toEqual(one)
  expect(one.skipped).toEqual([
    { path: 'b.bin', reason: 'binary' },
    { path: 'big.txt', reason: 'too-large' },
  ])
  expect(one.fileList?.filter((f) => f.path.endsWith('a.ts'))).toHaveLength(3)
})
