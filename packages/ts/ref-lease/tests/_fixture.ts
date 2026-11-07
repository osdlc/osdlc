/** A bare authority and a worker repository that knows it as `authority`. */

import { join } from 'node:path'

import { type Git } from '@osdlc/typed-git'
import { makeBareAndWorker, makeGitFixture } from '@osdlc/typed-git/testing'

export interface Pair {
  root: string
  authority: string
  worker: string
  authorityGit: Git
  workerGit: Git
  /** A fresh repository under `root` with one commit, to fetch into. */
  reader(name: string): string
  cleanup(): void
}

export function makePair(): Pair {
  const pair = makeBareAndWorker({ remoteName: 'authority' })
  pair.worker.commit('init', { '.gitkeep': '' })
  return {
    root: pair.parent,
    authority: pair.bare.dir,
    worker: pair.worker.dir,
    authorityGit: pair.bare.git,
    workerGit: pair.worker.git,
    reader(name) {
      const fx = makeGitFixture({ dir: join(pair.parent, name) })
      fx.commit('init', { '.gitkeep': '' })
      return fx.dir
    },
    cleanup: pair.cleanup,
  }
}

export const REF = 'refs/locks/build-cache'

export function samplePayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { holder: 'worker-a', token: '7f1c', state: 'held', ...over }
}
