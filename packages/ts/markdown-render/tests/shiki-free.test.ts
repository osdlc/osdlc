/**
 * Pins the import graph: the main and Vue entries never reach Shiki. A
 * consumer that does not import `@osdlc/markdown-render/shiki` must ship no
 * Shiki chunk — hundreds of grammar files otherwise ride into every build.
 *
 * The bundle runs as a `bun build` subprocess, not in-process `Bun.build`:
 * in-process bundling shares module state with the other test files and fails
 * once one of them has loaded the pipeline. This package has no path to the
 * repo's command seam, and the child runs to completion before it is read.
 */

import { describe, expect, test } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const src = (name: string) => new URL(`../src/${name}`, import.meta.url).pathname

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** Bundle the entries and report which outputs mention `shiki`, by path or text. */
function shikiMentions(entrypoints: string[]): { paths: string[]; texts: string[] } {
  const outdir = mkdtempSync(join(tmpdir(), 'markdown-render-shiki-free-'))
  try {
    const build = Bun.spawnSync({
      cmd: [
        process.execPath,
        'build',
        ...entrypoints,
        '--splitting',
        '--target=browser',
        '--external',
        'vue',
        '--outdir',
        outdir,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(build.exitCode, build.stderr.toString()).toBe(0)
    const files = walk(outdir)
    expect(files.length).toBeGreaterThan(0)
    return {
      paths: files.filter((file) => /shiki/i.test(file.slice(outdir.length))),
      texts: files.filter((file) => /shiki/i.test(readFileSync(file, 'utf8'))),
    }
  } finally {
    rmSync(outdir, { recursive: true, force: true })
  }
}

describe('import graph', () => {
  test('the main and Vue entries bundle without a trace of Shiki', () => {
    const found = shikiMentions([src('index.ts'), src('vue/index.ts')])
    expect(found.paths).toEqual([])
    expect(found.texts).toEqual([])
  })

  test('the /shiki subpath does bundle Shiki, so the check above can fail', () => {
    const found = shikiMentions([src('shiki.ts')])
    expect(found.texts.length).toBeGreaterThan(0)
  })
})
