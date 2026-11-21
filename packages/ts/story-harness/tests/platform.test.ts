// story-shots.sh pulls the image again unless platform_matches says the cached
// copy serves STORY_SHOTS_PLATFORM. CI runs only linux/amd64, so the variant
// cases are covered here.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../src/runner/platform.sh', import.meta.url))
const matches = (cached: string, wanted: string): boolean =>
  spawnSync('bash', ['-c', 'source "$0"; platform_matches "$1" "$2"', script, cached, wanted])
    .status === 0

describe('platform_matches', () => {
  it.each([
    ['linux/amd64', 'linux/amd64'],
    ['linux/arm64/v8', 'linux/arm64/v8'],
    ['linux/arm64/v8', 'linux/arm64'],
    ['linux/arm64', 'linux/arm64/v8'],
  ])('keeps a cached %s for %s', (cached, wanted) => {
    expect(matches(cached, wanted)).toBe(true)
  })

  it.each([
    ['', 'linux/amd64'],
    ['linux/arm64', 'linux/amd64'],
    ['linux/arm64/v8', 'linux/amd64'],
    ['linux/arm/v6', 'linux/arm/v7'],
  ])('pulls again when cached is %j and the platform is %s', (cached, wanted) => {
    expect(matches(cached, wanted)).toBe(false)
  })
})
