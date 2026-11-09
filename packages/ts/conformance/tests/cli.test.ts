import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { test } from 'vitest'

import { main, type Run } from '@osdlc/conformance'

import { FAMILY, inRepo, SUITE, type Put } from './_fixture.ts'

interface Ran {
  status: number
  out: string
  version: string
  calls: string[]
}

/**
 * `main(args)` on the conforming repository, its family referenced by the
 * crate. The runner stands in for cargo: the generator stamps
 * `referenceVersion` 9.9.9, as a version bump makes it. `edit` changes files
 * first.
 */
function runStamping(args: string[], edit: (put: Put) => void = () => {}): Ran {
  return inRepo(
    (put) => {
      const family = {
        ...FAMILY,
        reference: 'rust',
        generator: 'cargo run -p dirs --example conformance-write',
      }
      put('packages/conformance/families.json', JSON.stringify({ dirs: family }))
      put('packages/conformance/dirs/suite.json', JSON.stringify({ ...SUITE, reference: 'rust' }))
      edit(put)
    },
    (root) => {
      const calls: string[] = []
      const run: Run = (command, argv, cwd) => {
        calls.push(`${cwd.slice(root.length) || '/'}: ${[command, ...argv].join(' ')}`)
        const file = join(cwd, '../conformance/dirs/suite.json')
        writeFileSync(
          file,
          JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), referenceVersion: '9.9.9' }),
        )
        return 0
      }
      const lines: string[] = []
      const io = { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l), run }
      const status = main([...args, '--root', root], io)
      const suite = JSON.parse(
        readFileSync(join(root, 'packages/conformance/dirs/suite.json'), 'utf8'),
      ) as {
        referenceVersion: string
      }
      return { status, out: lines.join('\n'), version: suite.referenceVersion, calls }
    },
  )
}

test('check passes a conforming repository and runs no generator', () => {
  const res = runStamping(['check'])
  assert.equal(res.status, 0, res.out)
  assert.deepEqual(res.calls, [])
  assert.match(res.out, /conformance suites pass/)
})

test('--regenerate fails on a suite its generator changed, naming the generator', () => {
  const res = runStamping(['check', '--regenerate'])
  assert.equal(res.status, 1)
  assert.deepEqual(res.calls, ['/packages/rust: cargo run -p dirs --example conformance-write'])
  assert.match(
    res.out,
    /packages\/conformance\/dirs\/suite\.json: its generator changed it; run `cargo run -p dirs --example conformance-write` and commit the result/,
  )
})

test('--regenerate --reference ts runs no Rust generator', () => {
  const res = runStamping(['check', '--regenerate', '--reference', 'ts'])
  assert.equal(res.status, 0, res.out)
  assert.deepEqual(res.calls, [])
})

test('--regenerate checks first, and runs no generator when a check fails', () => {
  const res = runStamping(['check', '--regenerate'], (put) =>
    put('packages/rust/dirs/tests/c.rs', '// reads nothing'),
  )
  assert.equal(res.status, 1)
  assert.equal(res.version, '0.2.0')
  assert.match(res.out, /no test under packages\/rust\/dirs\/tests/)
})

test('write keeps what the generator wrote and exits 0, even when a check fails', () => {
  const res = runStamping(['write'], (put) =>
    put('packages/rust/dirs/tests/c.rs', '// reads nothing'),
  )
  assert.equal(res.status, 0, res.out)
  assert.equal(res.version, '9.9.9')
  assert.match(res.out, /rewrote packages\/conformance\/dirs\/suite\.json/)
})

test('a TypeScript reference is built with what it imports before its generator runs', () => {
  const res = inRepo(
    () => {},
    (root) => {
      const calls: string[] = []
      const run: Run = (command, argv) => {
        calls.push([command, ...argv].join(' '))
        return 0
      }
      const status = main(['write', '--root', root], { out: () => {}, err: () => {}, run })
      return { status, calls }
    },
  )
  assert.equal(res.status, 0)
  assert.deepEqual(res.calls, [
    'pnpm --filter @x/dirs... --if-present run build',
    'pnpm --filter @x/dirs conformance:write',
  ])
})

test('a failed generator fails the command', () => {
  const res = inRepo(
    () => {},
    (root) => {
      const lines: string[] = []
      const run: Run = (command) => (command === 'pnpm' ? 3 : 0)
      const status = main(['write', '--root', root], {
        out: () => {},
        err: (l) => lines.push(l),
        run,
      })
      return { status, lines }
    },
  )
  assert.equal(res.status, 1)
  assert.deepEqual(res.lines, ['pnpm --filter @x/dirs... --if-present run build exited 3'])
})

test('--families names a registry elsewhere', () => {
  const res = inRepo(
    (put) => {
      put('suites/families.json', JSON.stringify({ dirs: FAMILY }))
      put('suites/dirs/README.md', '# dirs\n')
      put('suites/dirs/suite.json', JSON.stringify(SUITE))
      put('packages/ts/dirs/tests/c.test.ts', "readSuite('../../../../suites/dirs/suite.json')")
      put('packages/rust/dirs/tests/c.rs', 'include_str!("../../../../suites/dirs/suite.json")')
    },
    (root) => {
      const lines: string[] = []
      const status = main(['check', '--root', root, '--families', 'suites/families.json'], {
        out: (l) => lines.push(l),
        err: (l) => lines.push(l),
      })
      return { status, lines }
    },
  )
  assert.equal(res.status, 0, res.lines.join('\n'))
})

test('a bad command line exits 2 with the usage', () => {
  const lines: string[] = []
  const io = { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) }
  assert.equal(main([], io), 2)
  assert.equal(main(['check', '--nope'], io), 2)
  assert.equal(main(['write', '--regenerate'], io), 2)
  assert.equal(main(['check', '--regenerate', '--reference', 'go'], io), 2)
  assert.equal(main(['check', '--reference', 'ts'], io), 2)
  assert.match(lines.join('\n'), /usage: conformance check/)
})
