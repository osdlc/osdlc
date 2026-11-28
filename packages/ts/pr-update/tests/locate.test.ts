/**
 * The standalone `locate`: a `--repo` target's checkout found under the roots
 * of `repositories.yaml`, or beside the project root, by its `origin`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { standaloneLocate, type StandaloneLocateOptions } from '../src/locate.ts'
import { standalonePorts } from '../src/defaults.ts'
import { literal, ownedAllBut } from './support.ts'

let root: string
let home: string
let notes: string[]
const real = spawnRunner('git')

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-locate-')))
  home = join(root, 'home')
  mkdirSync(home)
  notes = []
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** The inode of `path`, to tell it apart in an owner check. */

/** The sandbox home, as `HOME` and as `USERPROFILE`, where Windows looks for it. */
const homeEnv = () => ({ HOME: home, USERPROFILE: home })

/** A checkout at `rel` under the home directory, its `origin` set to `url`. */
function checkout(rel: string, url: string, commits = 1): string {
  const fx = makeGitFixture({ dir: join(home, rel) })
  for (let i = 0; i < commits; i += 1) fx.commit(`c${i}`, { 'a.txt': `${i}` })
  fx.git.remoteAdd('origin', url)
  return fx.dir
}

/** Write `repositories.yaml` in the sandbox's osdlc config home. */
function writeRoots(text: string): string {
  const file = join(
    osdlcDirs({ env: homeEnv() }).standalone('osdlc').config().path,
    'repositories.yaml',
  )
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return file
}

/** A locate inside the sandbox, counting the `remote get-url` calls the scan makes. */
function locateIn(projectRoot?: string, rule?: StandaloneLocateOptions['rule']) {
  const calls = { getUrl: 0 }
  const git: CommandRunner = {
    run: (argv, opts) => {
      if (argv[0] === 'remote' && argv[1] === 'get-url') calls.getUrl += 1
      return real.run(argv, opts)
    },
  }
  const locate = standaloneLocate({
    projectRoot,
    git,
    env: homeEnv(),
    notice: (line) => void notes.push(line),
    locator: { resolveAlias: () => null },
    rule,
  })
  const target = (host: string, owner: string, name: string, port?: number) =>
    locate(`${owner}/${name}`, { host, owner, name, ...(port === undefined ? {} : { port }) })
  return { target, calls }
}

describe('standaloneLocate', () => {
  test('finds a checkout under the roots of repositories.yaml, read through origin', () => {
    writeRoots(`roots:\n  - ${join(home, 'src')}\n`)
    const path = checkout('src/api', 'https://github.com/acme/api.git')
    expect(locateIn().target('github.com', 'acme', 'api')).toEqual({
      path,
      source: 'located',
      remote: 'origin',
    })
    expect(notes).toEqual([])
  })

  test('with no roots configured, looks beside the project root', () => {
    const project = checkout('dev/widgets', 'https://github.com/acme/widgets.git')
    const path = checkout('dev/api', 'https://github.com/acme/api.git')
    expect(locateIn(project).target('github.com', 'acme', 'api')?.path).toBe(path)
  })

  test('a checkout on another host is not the target', () => {
    writeRoots(`roots:\n  - ${home}\n`)
    checkout('api', 'https://github.com/acme/api.git')
    expect(locateIn().target('git.example.com', 'acme', 'api')).toBeNull()
  })

  test('a shallow checkout is skipped, and the note says why', () => {
    writeRoots(`roots:\n  - ${join(home, 'src')}\n`)
    const source = checkout('source', 'https://github.com/acme/web.git', 2)
    const shallow = join(home, 'src', 'api')
    mkdirSync(dirname(shallow), { recursive: true })
    real.run(['clone', '--quiet', '--depth', '1', `file://${source}`, shallow], { cwd: home })
    real.run(['remote', 'set-url', 'origin', 'https://github.com/acme/api.git'], { cwd: shallow })
    expect(locateIn().target('github.com', 'acme', 'api')).toBeNull()
    expect(notes[0]).toBe(`github.com/acme/api: ${shallow} is shallow, so it is not used`)
  })

  test('a target not found names the roots searched and repositories.yaml', () => {
    const file = writeRoots(`roots:\n  - ${join(home, 'src')}\n`)
    mkdirSync(join(home, 'src'))
    expect(locateIn().target('github.com', 'acme', 'api')).toBeNull()
    expect(notes).toEqual([
      `github.com/acme/api: no checkout under ${join(home, 'src')} (the roots are set in ${file})`,
    ])
  })

  test('with no roots at all, the note says so and where to set them', () => {
    const file = join(
      osdlcDirs({ env: homeEnv() }).standalone('osdlc').config().path,
      'repositories.yaml',
    )
    expect(locateIn().target('github.com', 'acme', 'api')).toBeNull()
    expect(notes).toEqual([
      `github.com/acme/api: no checkout found: no roots to search (set the roots in ${file})`,
    ])
  })

  test('the note mentions directories the depth limit left unopened', () => {
    writeRoots(`roots:\n  - ${join(home, 'src')}\n`)
    checkout('src/a/b/c/api', 'https://github.com/acme/api.git')
    expect(locateIn().target('github.com', 'acme', 'api')).toBeNull()
    expect(notes[0]).toMatch(/not opened past the depth limit, so a checkout may sit deeper$/)
  })

  test('with several checkouts, the first by path serves and the note names the rest', () => {
    writeRoots(`roots:\n  - ${home}\n`)
    const a = checkout('a/api', 'https://github.com/acme/api.git')
    const b = checkout('b/api', 'git@github.com:Acme/API.git')
    expect(locateIn().target('github.com', 'acme', 'api')).toEqual({
      path: a,
      source: 'located',
      remote: 'origin',
      others: [b],
    })
    expect(notes).toEqual([`github.com/acme/api: using ${a}; also checked out at ${b}`])
  })

  test('a shallow checkout is not used, but is among the others the guard reads', () => {
    writeRoots(`roots:\n  - ${home}\n`)
    const source = checkout('source', 'https://github.com/acme/web.git', 2)
    const shallow = join(home, 'a', 'api')
    mkdirSync(dirname(shallow), { recursive: true })
    real.run(['clone', '--quiet', '--depth', '1', `file://${source}`, shallow], { cwd: home })
    real.run(['remote', 'set-url', 'origin', 'https://github.com/acme/api.git'], { cwd: shallow })
    const full = checkout('b/api', 'https://github.com/acme/api.git')
    expect(locateIn().target('github.com', 'acme', 'api')).toMatchObject({
      path: full,
      others: [shallow],
    })
  })

  // POSIX modes; Windows does not say who can write.
  describe.skipIf(process.platform === 'win32')('the folder rule (S13)', () => {
    test.each([
      ['its work tree', (dir: string) => dir],
      ['its git directory', (dir: string) => join(dir, '.git')],
      ['its config file', (dir: string) => join(dir, '.git', 'config')],
    ])(
      'a checkout where others can write to %s is skipped, and is not among the others',
      (_, part) => {
        writeRoots(`roots:\n  - ${home}\n`)
        const a = checkout('a/api', 'https://github.com/acme/api.git')
        const b = checkout('b/api', 'https://github.com/acme/api.git')
        chmodSync(part(a), 0o777)
        expect(locateIn().target('github.com', 'acme', 'api')).toEqual({
          path: b,
          source: 'located',
          remote: 'origin',
        })
        expect(notes).toEqual([
          `github.com/acme/api: ${a} is not used: ${part(a)} can be written by anyone; run \`chmod go-w ${part(a)}\``,
        ])
      },
    )

    test('a checkout another user owns is skipped', () => {
      writeRoots(`roots:\n  - ${home}\n`)
      const a = checkout('a/api', 'https://github.com/acme/api.git')
      const theirs = realpathSync.native(a)
      const owned = ownedAllBut(theirs)
      expect(locateIn(undefined, { owned }).target('github.com', 'acme', 'api')).toBeNull()
      expect(notes[0]).toBe(`github.com/acme/api: ${a} is not used: ${a} belongs to another user`)
    })
  })

  describe('a port is part of the host a checkout serves (S13)', () => {
    test.each([
      ['https://ghe.example:3000/acme/api.git', 3000, true],
      ['https://ghe.example:3000/acme/api.git', 4000, false],
      ['https://ghe.example:3000/acme/api.git', undefined, false],
      ['https://ghe.example/acme/api.git', 3000, false],
      ['https://ghe.example:443/acme/api.git', undefined, true],
      ['http://ghe.example:80/acme/api.git', undefined, true],
      ['git@ghe.example:acme/api.git', undefined, true],
      ['git@ghe.example:acme/api.git', 3000, false],
      ['ssh://git@ghe.example:2222/acme/api.git', 2222, false],
    ])('origin %s, --repo port %s: used %s', (url, port, used) => {
      writeRoots(`roots:\n  - ${home}\n`)
      const path = checkout('api', url)
      const found = locateIn().target('ghe.example', 'acme', 'api', port)
      if (used) expect(found).toMatchObject({ path, source: 'located' })
      else {
        expect(found).toBeNull()
        expect(notes[0]).toMatch(
          new RegExp(`^ghe\\.example/acme/api: ${literal(path)} is not used: its origin `),
        )
      }
    })
  })

  test('scans the roots once per run, and resolves each target once', () => {
    writeRoots(`roots:\n  - ${home}\n`)
    checkout('api', 'https://github.com/acme/api.git')
    checkout('web', 'https://github.com/acme/web.git')
    const { target, calls } = locateIn()
    target('github.com', 'acme', 'api')
    const afterFirst = calls.getUrl
    target('github.com', 'acme', 'web')
    // One more read, of the match's own origin for its port; no second scan.
    expect(calls.getUrl).toBe(afterFirst + 1)
    target('github.com', 'acme', 'web')
    target('github.com', 'acme', 'nope')
    target('github.com', 'acme', 'nope')
    expect(calls.getUrl).toBe(afterFirst + 1)
    expect(notes.filter((l) => l.includes('acme/nope'))).toHaveLength(1)
  })

  test('a run with no --repo reads no file and scans nothing', () => {
    // A relative OSDLC_ROOT throws the moment the osdlc directories are read.
    const ports = standalonePorts(undefined, undefined, 'origin', () => {}, {
      env: { ...homeEnv(), OSDLC_ROOT: 'relative' },
    })
    expect(typeof ports.locate).toBe('function')
  })
})
