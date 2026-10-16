/**
 * Need: read structured data from a tool that prints JSON (`gh … --json`,
 * `npm view --json`, `npm outdated --json`), check its shape, and say which
 * step went wrong when it is not usable.
 *
 * `runJson` runs, checks the run succeeded, parses stdout and, with `parse`,
 * validates the value. It never throws for a failed command: the outcome's
 * `reason` is `failed`, `unparseable` or `invalid`. `okExitCodes` accepts a
 * non-zero exit that is an answer. `parseJsonResult` is the parse step alone,
 * for a result already in hand.
 */

import { expect, test } from 'bun:test'

import {
  parseJsonResult,
  runJson,
  runJsonAsync,
  spawnRunner,
  spawnRunnerAsync,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type JsonRun,
  type RunJsonOptions,
} from '@osdlc/command-seam'
import { fakeNeverExited, fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

interface PullRequest {
  number: number
  title: string
  isDraft: boolean
}

/** A hand-written validator; a schema library's `parse` fits the same slot. */
function parsePullRequests(value: unknown): PullRequest[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value.map((item: Partial<PullRequest> | null, i) => {
    const { number, title, isDraft } = item ?? {}
    if (typeof number !== 'number' || typeof title !== 'string' || typeof isDraft !== 'boolean') {
      throw new Error(`item ${i} is not { number, title, isDraft }`)
    }
    return { number, title, isDraft }
  })
}

class GhError extends Error {}

/** Open pull requests in the repo at `dir`, checked against the expected shape. */
function openPullRequests(dir: string, gh: CommandRunner = spawnRunner('gh')): PullRequest[] {
  const argv = ['pr', 'list', '--state', 'open', '--json', 'number,title,isDraft']
  const r = runJson(gh, argv, { cwd: dir, parse: parsePullRequests })
  if (r.ok) return r.value
  throw new GhError(`gh pr list (${r.reason}): ${r.message}`, {
    cause: r.reason === 'invalid' ? r.cause : undefined,
  })
}

type Outdated = Record<string, { current: string; latest: string }>

/** npm's own errors also exit 1, as `{ "error": { "summary": … } }`. */
function parseOutdated(value: unknown): Outdated {
  if (typeof value !== 'object' || value === null) throw new Error('expected an object')
  const error = (value as { error?: { summary?: unknown } }).error
  if (error !== undefined) throw new Error(`npm: ${String(error.summary)}`)
  for (const [name, v] of Object.entries(value as Record<string, Partial<Outdated[string]>>)) {
    if (typeof v.current !== 'string' || typeof v.latest !== 'string') {
      throw new Error(`${name} is not { current, latest }`)
    }
  }
  return value as Outdated
}

/** Outdated dependencies. `npm outdated` exits 1 when there are any. */
function outdatedPackages(dir: string, npm: CommandRunner = spawnRunner('npm')): JsonRun<Outdated> {
  // Exit 1 is the answer "some are outdated", but npm's own errors exit 1
  // too, so `parse` must reject npm's error object.
  return runJson(npm, ['outdated', '--json'], {
    cwd: dir,
    okExitCodes: [0, 1],
    parse: parseOutdated,
  })
}

/** npm may print a warning line before the JSON. */
const npmJson: RunJsonOptions = { tolerateLeadingLog: true }

/** npm prints a bare string, not a list, for a package with one version. */
function versionList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value
  throw new Error('expected a version or a list of versions')
}

/** Every published version of `name`; empty when npm cannot say. */
async function publishedVersions(
  name: string,
  npm: AsyncCommandRunner = spawnRunnerAsync('npm'),
): Promise<string[]> {
  const argv = ['view', name, 'versions', '--json']
  const r = await runJsonAsync(npm, argv, { cwd: process.cwd(), ...npmJson, parse: versionList })
  return r.ok ? r.value : []
}

/** Run once more after a timeout; any other outcome is final. */
function retryOnTimeout(npm: CommandRunner, argv: string[]): CommandResult {
  const run = () => npm.run(argv, { cwd: process.cwd(), timeoutMs: 30_000 })
  const r = run()
  return r.reason === 'timeout' ? run() : r
}

/** The latest version of `name`, or `null` when npm cannot say. */
function latestVersion(name: string, npm: CommandRunner = spawnRunner('npm')): string | null {
  // The result comes from a helper, not a runner, so `parseJsonResult` reads it.
  const r = parseJsonResult(retryOnTimeout(npm, ['view', name, 'version', '--json']), {
    parse: (v) => {
      if (typeof v !== 'string') throw new Error('expected a version')
      return v
    },
  })
  return r.ok ? r.value : null
}

// ---- Tests -----------------------------------------------------------------

const prList = 'pr list --state open --json number,title,isDraft'

test('parses and checks the pull requests', () => {
  const { runner } = fakeRunner({
    [prList]: { stdout: '[{"number":7,"title":"Fix login","isDraft":false}]\n' },
  })

  expect(openPullRequests('/repo', runner)).toEqual([
    { number: 7, title: 'Fix login', isDraft: false },
  ])
})

test('the error says which step failed', () => {
  const failed = fakeRunner({ [prList]: { exitCode: 4, stderr: 'not logged in\n' } })
  const garbled = fakeRunner({ [prList]: { stdout: 'Fetching…\n' } })

  expect(() => openPullRequests('/repo', failed.runner)).toThrow(
    'gh pr list (failed): not logged in',
  )
  expect(() => openPullRequests('/repo', garbled.runner)).toThrow(
    'gh pr list (unparseable): stdout is not JSON',
  )
})

test('a value of the wrong shape is invalid, with what parse threw', () => {
  const { runner } = fakeRunner({ [prList]: { stdout: '[{"number":"7"}]' } })

  let caught: unknown
  try {
    openPullRequests('/repo', runner)
  } catch (e) {
    caught = e
  }

  expect((caught as Error).message).toBe(
    'gh pr list (invalid): stdout JSON was rejected: item 0 is not { number, title, isDraft }',
  )
  expect(((caught as Error).cause as Error).message).toBe(
    'item 0 is not { number, title, isDraft }',
  )
})

test('exit 1 from npm outdated is an answer, unless npm itself failed', () => {
  const outdated = fakeRunner({
    'outdated --json': { exitCode: 1, stdout: '{"left-pad":{"current":"1.0.0","latest":"1.3.0"}}' },
  })
  const npmError = fakeRunner({
    'outdated --json': { exitCode: 1, stdout: '{"error":{"summary":"No package.json found"}}' },
  })
  const noNpm = fakeRunner({})

  const r = outdatedPackages('/app', outdated.runner)

  expect(r.ok && r.value['left-pad']?.latest).toBe('1.3.0')
  expect(outdatedPackages('/tmp', npmError.runner)).toMatchObject({
    ok: false,
    reason: 'invalid',
    message: 'stdout JSON was rejected: npm: No package.json found',
  })
  // A run that never exited is `failed`, whatever its stand-in exit code.
  expect(outdatedPackages('/app', noNpm.runner)).toMatchObject({ ok: false, reason: 'failed' })
})

test('a warning line before the JSON is skipped', async () => {
  const { asyncRunner } = fakeRunner({
    'view left-pad versions --json': { stdout: 'npm warn config ignoring\n["1.0.0","1.3.0"]\n' },
  })

  expect(await publishedVersions('left-pad', asyncRunner)).toEqual(['1.0.0', '1.3.0'])
})

test('one published version comes back as a list too', async () => {
  const { asyncRunner } = fakeRunner({ 'view solo versions --json': { stdout: '"1.0.0"\n' } })

  expect(await publishedVersions('solo', asyncRunner)).toEqual(['1.0.0'])
})

test('a result from another helper is parsed in hand', () => {
  let n = 0
  const { runner, calls } = fakeRunner(() =>
    n++ === 0 ? fakeNeverExited('timeout') : { stdout: '"1.3.0"\n' },
  )
  const gone = fakeRunner({ 'view gone version --json': { exitCode: 1, stderr: 'E404\n' } })

  expect(latestVersion('left-pad', runner)).toBe('1.3.0')
  expect(calls).toHaveLength(2)
  expect(latestVersion('gone', gone.runner)).toBeNull()
})
