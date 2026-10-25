import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runChecked, spawnRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import type { Task } from '../src/model.ts'
import { dependenciesIn, shLineArgs, tierOf } from '../src/plugins/support/shared.ts'

describe('tierOf', () => {
  test('strips a ./ prefix but not a leading dot-directory', () => {
    expect(tierOf('./packages/a/package.json')).toBe('packages/a')
    expect(tierOf('.github/actions/my-action')).toBe('.github/actions')
    expect(tierOf('.config/tools/x')).toBe('.config/tools')
  })

  test('the root and root-level files group under .', () => {
    expect(tierOf('.')).toBe('.')
    expect(tierOf('./')).toBe('.')
    expect(tierOf('package.json')).toBe('.')
    expect(tierOf('./package.json')).toBe('.')
  })
})

describe('dependenciesIn', () => {
  test('resolves known names to ids, keeps the rest, and drops repeats', () => {
    expect(dependenciesIn('just', 'justfile', ['a', 'x', 'a', 'x'], new Set(['a']))).toEqual({
      dependsOn: ['just:justfile:a'],
      dependsOnUnresolved: ['x'],
    })
    expect(dependenciesIn('just', 'justfile', [], new Set())).toEqual({})
  })
})

describe('shLineArgs', () => {
  const task = (line: string) => ({ runner: 'procfile', argv: ['sh', '-c', line] }) as Task

  // Forms whose meaning is the same in every POSIX sh.
  const accepted = [
    'printf "[%s]" 2>&1',
    'printf "[%s]" >&2',
    'printf "[%s]" 1>&2',
    'printf "[%s]" <&0',
    'printf "[%s]" 3>&-',
    'printf "[%s]" 2>>err.log',
    'printf "[%s]" 2>"#.log"',
    'printf "[%s]" 2>a#b.log',
    'printf "[%s]" 2>$#.log',
  ]

  // Forms that would split the line, comment out the arguments, or that bash
  // and dash read differently.
  const refused: Array<[string, string]> = [
    ['a && b', 'more than one command'],
    ['a & b', 'more than one command'],
    ['make 2>&1 &', 'more than one command'],
    ['a; b', 'more than one command'],
    ['a | b', 'more than one command'],
    ['a |& b', 'more than one command'],
    ['a\nb', 'more than one command'],
    ['make &>log', 'only some shells'],
    ['make &>>log', 'only some shells'],
    ['make >&log', 'only some shells'],
    ['make >& log', 'only some shells'],
    ['make 2>&1x', 'only some shells'],
    ['diff <(a) b', 'only some shells'],
    ['tee >(a)', 'only some shells'],
    ['cat <<<word', 'only some shells'],
    ["echo $'\\''", 'only some shells'],
    ['make # build', '# comment'],
    ['(make)#x', '# comment'],
    ['echo "unclosed', 'unclosed quote'],
  ]

  test.each(accepted)('accepts %j', (line) => {
    expect(shLineArgs(task(line), ['x'])).toEqual(['sh', '-c', `${line} "$@"`, 'sh', 'x'])
  })

  test.each(refused)('refuses %j', (line, why) => {
    expect(() => shLineArgs(task(line), ['x'])).toThrow(why)
  })

  const dash = existsSync('/bin/dash') ? '/bin/dash' : undefined
  const runDash = (argv: string[], cwd: string) => {
    const r = runChecked(spawnRunner(dash!), argv.slice(1), { cwd })
    return r.stdout + r.stderr
  }

  test.skipIf(dash === undefined)(
    'under dash, every accepted line passes the arguments to its one command (needs /bin/dash)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'sh-line-'))
      try {
        for (const line of accepted) {
          const argv = shLineArgs(task(line), ['a b', 'c'])!
          expect(runDash(argv, dir), line).toBe('[a b][c]')
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )

  test.skipIf(dash === undefined)(
    'under dash, &> runs the first argument as a program, so it is refused (needs /bin/dash)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'sh-line-'))
      try {
        // What shLineArgs used to build for `echo built &>out.log`.
        runDash(['sh', '-c', 'echo built &>out.log "$@"', 'sh', 'touch', 'PWNED'], dir)
        expect(existsSync(join(dir, 'PWNED'))).toBe(true)
        expect(() => shLineArgs(task('echo built &>out.log'), ['touch', 'PWNED'])).toThrow(
          'only some shells',
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})
