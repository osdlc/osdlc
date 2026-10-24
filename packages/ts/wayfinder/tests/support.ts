/** Throwaway fixture directories for the config, trust and clean tests. */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** A throwaway directory tree. `files` maps root-relative paths to contents. */
export async function fixtureRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wayfinder-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf-8')
  }
  return root
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}
