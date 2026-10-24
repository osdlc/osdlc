/**
 * The README's `way query dev` example. The package ships only the `way`
 * binary, so this calls the CLI's `main` the binary runs.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'
import { main } from '../src/cli.ts'

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

test('query dev prints the matching command line and exits 0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wayfinder-readme-'))
  const home = await mkdtemp(join(tmpdir(), 'wayfinder-readme-home-'))
  dirs.push(dir, home)
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { build: 'echo b', dev: 'vite' } }),
  )

  const io = captureIo()
  const code = await main(['query', 'dev', '-C', dir], {}, home, io)

  expect(code).toBe(0)
  expect(io.out).toBe('npm run dev\n')
})
