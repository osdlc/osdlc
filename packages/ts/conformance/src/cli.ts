/**
 * The `conformance` command.
 *
 *   conformance check                  check every family
 *   conformance check --regenerate     also build each TypeScript reference
 *                                      and what it imports, run each
 *                                      generator, then fail if a suite changed
 *   conformance write                  only run the generators, as
 *                                      --regenerate does, and keep what they
 *                                      write. A version bump runs it: each
 *                                      suite records its reference's version
 *
 * `--reference ts|rust` limits the generators to the families whose reference
 * is that language. `--families <path>` names the registry, by default
 * packages/conformance/families.json; a relative path is read from the root,
 * and the file must be inside it. `--root <dir>` is the repository root,
 * by default the working directory.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

import { LANGUAGES } from './checks.ts'
import { checkRepo, regenerate, type Run } from './repo.ts'

const USAGE = `usage: conformance check [--regenerate] [--reference ts|rust] [--families <path>] [--root <dir>]
       conformance write [--reference ts|rust] [--families <path>] [--root <dir>]`

/** Where the command writes, and how it runs commands. Tests replace them. */
export interface CliIo {
  out: (line: string) => void
  err: (line: string) => void
  run?: Run | undefined
}

const consoleIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
}

/** Runs the command with `argv` (without the program name) and returns its exit code. */
export function main(argv: string[], io: CliIo = consoleIo): number {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (e) {
    io.err(`${(e as Error).message}\n${USAGE}`)
    return 2
  }
  const { command, values } = parsed
  const reference = values.reference
  if (reference !== undefined && !(LANGUAGES as readonly string[]).includes(reference)) {
    io.err(`--reference is ts or rust, not ${reference}\n${USAGE}`)
    return 2
  }
  const root = resolve(values.root ?? process.cwd())
  // The checks name files relative to the root, so the registry is too.
  let families: string | undefined
  if (values.families !== undefined) {
    families = relative(root, resolve(root, values.families)).split(sep).join('/')
    if (
      families === '' ||
      families.startsWith('../') ||
      families === '..' ||
      isAbsolute(families)
    ) {
      io.err(`--families must name a file inside --root, not ${values.families}\n${USAGE}`)
      return 2
    }
  }
  const options = { families, reference, run: io.run, log: io.out }
  try {
    // No checks first: a version bump writes the suites even when a check
    // fails, and the pull request it opens fails CI there instead.
    if (command === 'write') {
      for (const c of regenerate(root, options)) io.out(`rewrote ${c.file}`)
      return 0
    }
    if (values.regenerate !== true && reference !== undefined) {
      io.err(`--reference needs --regenerate\n${USAGE}`)
      return 2
    }
    const problems = checkRepo(root, options)
    if (problems.length === 0 && values.regenerate === true) {
      for (const c of regenerate(root, options)) {
        problems.push(
          `${c.file}: its generator changed it; run \`${c.generator}\` and commit the result`,
        )
      }
    }
    if (problems.length > 0) {
      for (const p of problems) io.err(`  ${p}`)
      io.err(`\n${problems.length} conformance problem(s)`)
      return 1
    }
    io.out('conformance suites pass')
    return 0
  } catch (e) {
    io.err((e as Error).message)
    return 1
  }
}

function parse(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      regenerate: { type: 'boolean' },
      reference: { type: 'string' },
      families: { type: 'string' },
      root: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  })
  const [command, ...rest] = positionals
  if (command !== 'check' && command !== 'write')
    throw new Error(command === undefined ? 'no command' : `unknown command ${command}`)
  if (rest.length > 0) throw new Error(`unexpected arguments: ${rest.join(' ')}`)
  if (command === 'write' && values.regenerate === true)
    throw new Error('write takes no --regenerate')
  return { command, values }
}
