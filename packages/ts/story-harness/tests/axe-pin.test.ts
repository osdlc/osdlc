/**
 * Every place that names the axe-core version agrees with the pin in
 * story-shots.sh, which is the one the container installs.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('the axe-core pin', () => {
  const pinned = /^AXE_VERSION="([^"]+)"/m.exec(read('../src/runner/story-shots.sh'))?.[1]

  it('is set in story-shots.sh', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it.each(['../README.md', '../docs/guide/accessibility-and-walk.md'])(
    'is the version %s names',
    (file) => {
      const named = [...read(file).matchAll(/axe-core (\d+\.\d+\.\d+)/g)].map((m) => m[1])
      expect(named.length).toBeGreaterThan(0)
      expect(new Set(named)).toEqual(new Set([pinned]))
    },
  )
})
