/** `catFileBatch`: byte-exact batched object reads, sync and async. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import { AsyncGit } from '../src/index.ts'
import { makeGitFixture } from '../src/testing.ts'

/** A repository with a text blob, a NUL blob, bytes that are not UTF-8, and a directory. */
function fixture() {
  const fx = makeGitFixture()
  mkdirSync(join(fx.dir, 'dir'))
  writeFileSync(join(fx.dir, 'a.txt'), 'hello\n')
  writeFileSync(join(fx.dir, 'bin.dat'), Buffer.from([1, 2, 0, 3, 10, 4]))
  writeFileSync(join(fx.dir, 'latin1.txt'), Buffer.from([0xe9, 0xff, 0x0a]))
  writeFileSync(join(fx.dir, 'with space.txt'), 'spaced\n')
  writeFileSync(join(fx.dir, 'dir', 'big.txt'), 'x'.repeat(5000))
  writeFileSync(join(fx.dir, 'empty.txt'), '')
  fx.commit('first')
  return fx
}

describe('catFileBatch', () => {
  test('reads text, binary and non-UTF-8 blobs byte for byte, and classifies the rest', () => {
    const fx = fixture()
    try {
      const names = [
        'HEAD:a.txt',
        'HEAD:bin.dat',
        'HEAD:latin1.txt',
        'HEAD:with space.txt',
        'HEAD:empty.txt',
        'HEAD:dir',
        'HEAD:nope.txt',
        'HEAD:dir/big.txt',
      ]
      const got = fx.git.catFileBatch(names, { maxBytes: 1000 })
      expect([...got.keys()].sort()).toEqual([...names].sort())

      const a = got.get('HEAD:a.txt')
      expect(a).toMatchObject({ kind: 'text', size: 6 })
      expect(a?.kind === 'text' && a.bytes.toString()).toBe('hello\n')
      const bin = got.get('HEAD:bin.dat')
      expect(bin?.kind === 'binary' && [...bin.bytes]).toEqual([1, 2, 0, 3, 10, 4])
      const latin = got.get('HEAD:latin1.txt')
      expect(latin?.kind === 'text' && [...latin.bytes]).toEqual([0xe9, 0xff, 0x0a])
      expect(got.get('HEAD:with space.txt')).toMatchObject({ kind: 'text', size: 7 })
      expect(got.get('HEAD:empty.txt')).toMatchObject({ kind: 'text', size: 0 })
      expect(got.get('HEAD:dir')).toMatchObject({ kind: 'not-blob', type: 'tree' })
      expect(got.get('HEAD:nope.txt')).toEqual({ kind: 'missing' })
      expect(got.get('HEAD:dir/big.txt')).toMatchObject({ kind: 'too-large', size: 5000 })
      expect(got.get('HEAD:dir/big.txt')).not.toHaveProperty('bytes')
    } finally {
      fx.cleanup()
    }
  })

  test('chunkBytes splits the content reads, and the chunks cover every name once', async () => {
    const fx = fixture()
    try {
      const names = ['HEAD:a.txt', 'HEAD:with space.txt', 'HEAD:dir/big.txt', 'HEAD:nope']
      const chunks = [...fx.git.catFileBatchChunks(names, { chunkBytes: 8 })]
      expect(chunks.length).toBe(3)
      expect(chunks.flatMap((c) => [...c.keys()]).sort()).toEqual([...names].sort())
      // The entries that need no read come with the first chunk.
      expect(chunks[0]?.get('HEAD:nope')).toEqual({ kind: 'missing' })

      const whole = fx.git.catFileBatch(names, { chunkBytes: 8 })
      expect(whole).toEqual(fx.git.catFileBatch(names))

      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.catFileBatch(names, { chunkBytes: 8 })).toEqual(whole)
      const asyncChunks: unknown[] = []
      for await (const c of asyncGit.catFileBatchChunks(names, { chunkBytes: 8 })) {
        asyncChunks.push(c)
      }
      expect(asyncChunks).toEqual(chunks)
    } finally {
      fx.cleanup()
    }
  })

  test('shas work as names, duplicates collapse, and no names is an empty map', () => {
    const fx = fixture()
    try {
      const sha = fx.git.raw(['rev-parse', 'HEAD:a.txt']).stdout.trim()
      const got = fx.git.catFileBatch([sha, sha, 'HEAD:a.txt'])
      expect([...got.keys()]).toEqual([sha, 'HEAD:a.txt'])
      expect(got.get(sha)).toEqual(got.get('HEAD:a.txt'))
      expect(fx.git.catFileBatch([]).size).toBe(0)
    } finally {
      fx.cleanup()
    }
  })

  test('a bad name or option throws TypeError, and a failing git throws the classified failure', async () => {
    const fx = fixture()
    try {
      for (const bad of ['', 'a\nb', 'a\0b']) {
        expect(() => fx.git.catFileBatch([bad])).toThrow(TypeError)
      }
      expect(() => fx.git.catFileBatch(['HEAD:a.txt'], { maxBytes: -1 })).toThrow(TypeError)
      expect(() => fx.git.catFileBatch(['HEAD:a.txt'], { chunkBytes: 0 })).toThrow(TypeError)
      await expect(new AsyncGit(fx.dir).catFileBatch([''])).rejects.toBeInstanceOf(TypeError)

      const outside = makeGitFixture()
      outside.cleanup()
      expect(() => outside.git.catFileBatch(['HEAD:a.txt'])).toThrow(FailureError)
    } finally {
      fx.cleanup()
    }
  })
})
