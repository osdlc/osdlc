/** Mirror names and messages never carry a URL's credentials; a clone race ends in one mirror. */

import { describe, expect, test } from 'vitest'
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import { ensureMirror, mirrorName, redactUrl } from '../src/remote-mirror.ts'

describe('redactUrl', () => {
  test('drops user-info, query and fragment, and leaves other text alone', () => {
    expect(redactUrl('https://me:TOKEN@host.example/acme/repo.git')).toBe(
      'https://host.example/acme/repo.git',
    )
    expect(redactUrl('fatal: https://x:TOKEN@h/a/b.git?t=SECRET#f not found')).toBe(
      'fatal: https://h/a/b.git not found',
    )
    expect(redactUrl('git@github.com:acme/repo.git')).toBe('git@github.com:acme/repo.git')
  })
})

describe('mirrorName', () => {
  test('a token in user-info or a query never reaches the name', () => {
    for (const url of [
      'https://me:TOKEN@git.example.com/acme/repo.git',
      'https://git.example.com/acme/repo.git?token=TOKEN',
      'https://git.example.com/acme/repo.git#TOKEN',
    ]) {
      const name = mirrorName(url)
      expect(name).not.toContain('TOKEN')
      expect(name).toMatch(/^git\.example\.com-acme-repo-[0-9a-f]{12}$/)
    }
  })

  test('two URLs of one repository get two mirrors', () => {
    expect(mirrorName('https://github.com/acme/repo.git')).not.toBe(
      mirrorName('git@github.com:acme/repo.git'),
    )
  })
})

describe('ensureMirror', () => {
  test('a run that loses the race to clone the same URL uses the winner clone', () => {
    const pair = makeBareAndWorker()
    try {
      sh(pair.worker.dir, ['commit', '-q', '--allow-empty', '-m', 'initial'])
      sh(pair.worker.dir, ['push', '-q', 'origin', 'main'])
      const cache = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-mirror-')))
      const url = pair.bare.dir
      const winner = join(cache, mirrorName(url))
      const real = spawnRunner('git', { absolutePathOnly: true })
      // The other run's clone lands in the final directory while this one is
      // still cloning to its staging directory.
      const racing: CommandRunner = {
        binary: 'git',
        run(argv, opts) {
          if (argv.includes('clone'))
            real.run(['clone', '-q', '--no-checkout', '--', url, winner], opts)
          return real.run(argv, opts)
        },
      }
      try {
        expect(ensureMirror(url, cache, { git: racing })).toBe(winner)
        expect(readdirSync(cache)).toEqual([basename(winner)])
      } finally {
        rmSync(cache, { recursive: true, force: true })
      }
    } finally {
      pair.cleanup()
    }
  })
})
