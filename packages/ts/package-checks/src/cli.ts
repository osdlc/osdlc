/**
 * The `package-checks` command.
 *
 *   package-checks ts [<package dir> ...]    pack each TypeScript package and check it
 *   package-checks rust                      check the shape of every crate in the Cargo workspace
 *   package-checks semver <Cargo.toml> <base-rev>
 *                                            a breaking change to a published crate sets its version
 *   package-checks affected [base] [head]    pick the packages a CI run checks
 *   package-checks stage [--dry-run] [--workflow <file>] [--environment <name>] <package dir> ...
 *                                            publish a new package's placeholder and add its trusted publisher
 *
 * Every command runs in the repository root, the working directory, and reads
 * its settings from `package-checks.json` there.
 */

import { appendFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { affectedOutputs, changedFiles, pick, readFamilies, readWorkspace } from './affected.ts'
import { checkTsPackages } from './check-ts.ts'
import { loadConfig } from './config.ts'
import { printSemverReport, semverCheck } from './semver.ts'
import { checkWorkspace } from './shape-rs.ts'
import { stage } from './stage.ts'

const USAGE = `usage: package-checks ts [<package dir> ...]
       package-checks rust
       package-checks semver <path/to/Cargo.toml> <base-rev>
       package-checks affected [base] [head]
       package-checks stage [--dry-run] [--workflow <file>] [--environment <name>] <package dir> ...`

/** Runs the command with `argv` (without the program name) and resolves to its exit code. */
export async function main(argv: string[], root: string = process.cwd()): Promise<number> {
  const [command, ...rest] = argv
  try {
    switch (command) {
      case 'ts':
        return checkTsPackages(root, rest, loadConfig(root))
      case 'rust':
        return rust(root, rest)
      case 'semver': {
        const [manifest, base, ...extra] = rest
        if (manifest === undefined || base === undefined || extra.length > 0)
          return usage('semver takes a Cargo.toml and a base revision')
        return printSemverReport(await semverCheck(manifest, base, root))
      }
      case 'affected':
        return affected(root, rest)
      case 'stage':
        return stageCommand(root, rest)
      default:
        return usage(command === undefined ? 'no command' : `unknown command ${command}`)
    }
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`)
    return 1
  }
}

function usage(problem: string): number {
  process.stderr.write(`${problem}\n${USAGE}\n`)
  return 2
}

function rust(root: string, rest: string[]): number {
  if (rest.length > 0) return usage('rust takes no arguments')
  const settings = loadConfig(root)
  const results = checkWorkspace(root, settings)
  let failed = 0
  for (const { member, problems } of results) {
    if (problems.length === 0) continue
    failed++
    process.stderr.write(`FAILED: ${settings.rustWorkspace}/${member}\n`)
    for (const p of problems) process.stderr.write(`  ${p}\n`)
  }
  if (failed > 0) {
    process.stderr.write(`\n${failed} crate(s) failed\n`)
    return 1
  }
  process.stdout.write(`all ${results.length} crate(s) passed\n`)
  return 0
}

function affected(root: string, rest: string[]): number {
  if (rest.length > 2) return usage('affected takes at most a base and a head')
  const [base = 'HEAD^1', head = 'HEAD'] = rest
  const settings = loadConfig(root)
  const event = process.env['EVENT']
  const manifests = readWorkspace(root, settings)
  const files = event === 'pull_request' ? changedFiles(root, base, head) : null
  const packages = pick({
    event,
    files,
    manifests,
    families: readFamilies(root, settings),
    settings,
  })
  const outputs = affectedOutputs(packages, manifests)
  process.stdout.write(
    files === null ? 'checking every package\n' : `changed files: ${files.length}\n`,
  )
  for (const [k, v] of Object.entries(outputs)) process.stdout.write(`${k}=${v}\n`)
  const output = process.env['GITHUB_OUTPUT']
  if (output) {
    appendFileSync(
      output,
      Object.entries(outputs)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(''),
    )
  }
  return 0
}

function stageCommand(root: string, rest: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        'dry-run': { type: 'boolean' },
        workflow: { type: 'string' },
        environment: { type: 'string' },
      },
      allowPositionals: true,
    })
  } catch (e) {
    return usage((e as Error).message)
  }
  if (parsed.positionals.length === 0) return usage('no package given')
  return stage(parsed.positionals, {
    dryRun: parsed.values['dry-run'],
    workflow: parsed.values.workflow,
    environment: parsed.values.environment,
    scope: loadConfig(root).scope,
  })
}
