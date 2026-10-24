/**
 * The shared `config` subcommand.
 *
 * Every case drives `runConfigCommand` directly with an INJECTED env and home,
 * both pointing at throwaway directories. The alternative — letting it fall
 * back to `process.env` and `os.homedir()` — would read the developer's own
 * `~/.config/wayfinder/config.json`, so the suite would pass or fail according to
 * what happens to be in it, and the `set` cases would edit it.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { TaskConfig } from '../src/config.ts'
import { runConfigCommand, takeConfigDir } from '../src/config-command.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function track(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

interface Ran {
  code: number
  out: string
  err: string
}

interface Scenario {
  run(argv: string[]): Promise<Ran>
  root: string
  /** Where the injected user layer lives, for asserting what `set --user` wrote. */
  userFile: string
  projectFile: string
}

/** A fresh project root and home directory, plus a runner bound to both. */
async function scenario(
  files: {
    project?: unknown
    user?: unknown
    /** Raw text for the project file, for the malformed-file case. */
    projectText?: string
    env?: Record<string, string | undefined>
    /** The calling tool's own defaults, as wayfinder's `{ allowExec: true }`. */
    defaults?: Partial<TaskConfig>
  } = {},
): Promise<Scenario> {
  const root = await track({ 'package.json': '{}' })
  const home = await track()

  const userFile = join(home, '.config/wayfinder/config.json')
  const projectFile = join(root, 'wayfinder.config.json')

  const write = async (file: string, text: string): Promise<void> => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text, 'utf-8')
  }
  if (files.user !== undefined) await write(userFile, `${JSON.stringify(files.user)}\n`)
  if (files.projectText !== undefined) await write(projectFile, files.projectText)
  else if (files.project !== undefined)
    await write(projectFile, `${JSON.stringify(files.project)}\n`)

  return {
    root,
    userFile,
    projectFile,
    async run(argv: string[]): Promise<Ran> {
      let out = ''
      let err = ''
      const code = await runConfigCommand('wayfinder', root, argv, {
        stdout: (text) => {
          out += text
        },
        stderr: (text) => {
          err += text
        },
        env: files.env ?? {},
        home,
        ...(files.defaults !== undefined ? { defaults: files.defaults } : {}),
      })
      return { code, out, err }
    },
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf-8'))
}

async function missing(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return false
  } catch {
    return true
  }
}

/** The aligned listing, back as `key -> [value, "(layer)"]`. */
function rows(stdout: string): Record<string, string[]> {
  return Object.fromEntries(
    stdout
      .trimEnd()
      .split('\n')
      .map((line) => {
        const [key = '', ...rest] = line.trim().split(/\s{2,}/)
        return [key, rest.map((part) => part.trim())]
      }),
  )
}

describe('config list', () => {
  test('names the layer that supplied each value', async () => {
    // The question this command exists to answer is "why is this setting not
    // what I set it to", so a value without its layer is only half an answer.
    const s = await scenario({
      user: { allowExec: true, runners: { order: ['moon'] } },
      project: { allowExec: false, runners: { disabled: ['cargo'] } },
    })
    const ran = await s.run(['list'])

    expect(ran.code).toBe(0)
    const listed = rows(ran.out)

    // The project layer wins over the user layer for a key both set.
    expect(listed['allowExec']).toEqual(['false', '(project)'])
    expect(listed['runners.disabled']).toEqual(['["cargo"]', '(project)'])
    // A key only the user file sets is labelled user, not project.
    expect(listed['runners.order']).toEqual(['["moon"]', '(user)'])
    // A key nobody set falls to the built-in defaults.
    expect(listed['discovery']).toEqual(['"auto"', '(default)'])

    // Locations are context, not data, so they stay off stdout.
    expect(ran.err).toContain(s.projectFile)
    expect(ran.err).toContain(s.userFile)
  })

  test('--json emits effective, sources and locations', async () => {
    const s = await scenario({ project: { discovery: 'walk' } })
    const ran = await s.run(['list', '--json'])

    expect(ran.code).toBe(0)
    const parsed = JSON.parse(ran.out) as {
      effective: { discovery: string }
      sources: Record<string, string>
      locations: { project: string; user: string; userFromEnv: boolean }
    }
    expect(parsed.effective.discovery).toBe('walk')
    expect(parsed.sources['discovery']).toBe('project')
    expect(parsed.sources['allowExec']).toBe('default')
    expect(parsed.locations.project).toBe(s.projectFile)
    expect(parsed.locations.userFromEnv).toBe(false)
  })

  test('an unknown key is a warning, and the rest of the file still lists', async () => {
    const s = await scenario({ project: { discovery: 'walk', futureThing: 1 } })
    const ran = await s.run(['list'])

    expect(ran.code).toBe(0)
    expect(ran.err).toContain('unknown setting "futureThing"')
    expect(rows(ran.out)['discovery']).toEqual(['"walk"', '(project)'])
  })

  test('a malformed file fails, naming the file', async () => {
    // Not a silent fallback: a setting that quietly did not apply is worse
    // than one that refused to load.
    const s = await scenario({ projectText: '{ not json' })
    const ran = await s.run(['list'])

    expect(ran.code).toBe(1)
    expect(ran.err).toContain(s.projectFile)
    expect(ran.err).toContain('invalid JSON')
    expect(ran.out).toBe('')
  })
})

describe('config get', () => {
  test('reads a nested path from the effective config', async () => {
    const s = await scenario({ project: { runners: { order: ['just', 'moon'] } } })
    expect(await s.run(['get', 'runners.order'])).toMatchObject({
      code: 0,
      out: '["just","moon"]\n',
    })
  })

  test('an unknown key exits non-zero rather than printing nothing', async () => {
    const s = await scenario()
    const ran = await s.run(['get', 'nope'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('no value for nope')
    expect(ran.out).toBe('')
  })

  test('an unset leaf of a known section exits non-zero too', async () => {
    const s = await scenario()
    const ran = await s.run(['get', 'runners.nothing'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('no value for runners.nothing')
  })
})

describe('config set', () => {
  test('--project round-trips through get', async () => {
    const s = await scenario()
    const wrote = await s.run(['set', 'discovery', 'walk'])
    expect(wrote.code).toBe(0)
    expect(wrote.out).toContain(s.projectFile)

    expect(await s.run(['get', 'discovery'])).toMatchObject({ code: 0, out: '"walk"\n' })
  })

  test('a bare word needs no quoting, and JSON is read as JSON', async () => {
    const s = await scenario()
    await s.run(['set', 'runners.order', '["moon","just"]'])
    await s.run(['set', 'allowExec', 'true'])

    expect(await readJson(s.projectFile)).toEqual({
      runners: { order: ['moon', 'just'] },
      allowExec: true,
    })
  })

  test('--user writes the injected user path, not the project file', async () => {
    const s = await scenario()
    const ran = await s.run(['set', '--user', 'discovery', 'git'])

    expect(ran.code).toBe(0)
    expect(ran.out).toContain(s.userFile)
    expect(await readJson(s.userFile)).toEqual({ discovery: 'git' })
    expect(await missing(s.projectFile)).toBe(true)
  })

  test('preserves a key this version does not know', async () => {
    // The reason `set` edits the RAW record: validation drops unknown keys, so
    // writing a validated document back would delete a setting a newer version
    // had written into the same file.
    const s = await scenario({ project: { futureThing: { deep: 1 }, allowExec: true } })
    const ran = await s.run(['set', 'discovery', 'git'])

    expect(ran.code).toBe(0)
    expect(await readJson(s.projectFile)).toEqual({
      allowExec: true,
      discovery: 'git',
      futureThing: { deep: 1 },
    })
  })

  test('refuses a bad value with a usage exit, leaving the file untouched', async () => {
    // `notabool` is not valid JSON, so it arrives as the string "notabool".
    // Refusing it here is the difference between one error message and a file
    // that fails to load on every later run.
    const s = await scenario({ project: { allowExec: true } })
    const before = await readFile(s.projectFile, 'utf-8')

    const ran = await s.run(['set', 'allowExec', 'notabool'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('allowExec must be true or false')
    expect(await readFile(s.projectFile, 'utf-8')).toBe(before)
  })

  test('an unknown key is a usage error, not a failed operation', async () => {
    // Same reasoning as the bad value above, and the same code: a name that is
    // not a setting cannot become one, whatever is on disk.
    const s = await scenario()
    const ran = await s.run(['set', 'nope', '1'])
    expect(ran.code).toBe(2)
    expect(ran.err).toContain('unknown setting: nope')
    expect(await missing(s.projectFile)).toBe(true)
  })

  test('a bad value ALREADY in the file exits 1 — that one is about the file', async () => {
    // The other side of the split. The typed command is fine; the file it has
    // to edit is not, and its name is in the message.
    const s = await scenario({ project: { discovery: 'sideways' } })
    const ran = await s.run(['set', 'allowExec', 'true'])

    expect(ran.code).toBe(1)
    expect(ran.err).toContain(s.projectFile)
    expect(ran.err).toContain('discovery must be one of')
  })
})

describe('config unset', () => {
  test('removes a nested key, pruning the container it emptied', async () => {
    const s = await scenario({ project: { runners: { disabled: ['cargo'], order: ['moon'] } } })

    expect((await s.run(['unset', 'runners.disabled'])).code).toBe(0)
    expect(await readJson(s.projectFile)).toEqual({ runners: { order: ['moon'] } })

    expect((await s.run(['unset', 'runners.order'])).code).toBe(0)
    expect(await readJson(s.projectFile)).toEqual({})
  })

  test('says so when the key was not set, rather than succeeding silently', async () => {
    // A silent success reads as "the setting is gone from where I meant",
    // which is wrong whenever the value actually lives in the other layer.
    const s = await scenario({ project: { discovery: 'walk' } })
    const ran = await s.run(['unset', 'allowExec'])

    expect(ran.code).toBe(1)
    expect(ran.err).toContain('allowExec is not set in')
    expect(await readJson(s.projectFile)).toEqual({ discovery: 'walk' })
  })

  test('says so when the target file does not exist at all', async () => {
    const s = await scenario()
    expect((await s.run(['unset', '--user', 'discovery'])).code).toBe(1)
    expect(await missing(s.userFile)).toBe(true)
  })
})

describe('WAYFINDER_CONFIG as the write target', () => {
  test('set --user creates the named file when it does not exist yet', async () => {
    // `loadConfig` treats a WAYFINDER_CONFIG pointing at nothing as an error, which
    // is why the write path resolves locations without loading — otherwise
    // there would be no way to create the file the env var names.
    const named = join(await track(), 'nested/elsewhere.json')
    const s = await scenario({ env: { WAYFINDER_CONFIG: named } })

    const ran = await s.run(['set', '--user', 'discovery', 'git'])
    expect(ran.code).toBe(0)
    expect(ran.out).toContain(named)
    expect(await readJson(named)).toEqual({ discovery: 'git' })
  })
})

describe('config path', () => {
  test('names both files and whether each exists', async () => {
    const s = await scenario({ project: { discovery: 'walk' } })
    const ran = await s.run(['path'])

    expect(ran.code).toBe(0)
    expect(ran.out).toContain(`${s.projectFile} (exists)`)
    expect(ran.out).toContain(`${s.userFile} (missing)`)
    expect(ran.out).not.toContain('WAYFINDER_CONFIG')
  })

  test('says when the user path came from WAYFINDER_CONFIG', async () => {
    const named = join(await track(), 'elsewhere.json')
    const s = await scenario({ env: { WAYFINDER_CONFIG: named } })
    const ran = await s.run(['path'])

    expect(ran.code).toBe(0)
    expect(ran.out).toContain(`${named} (missing)`)
    expect(ran.out).toContain('from WAYFINDER_CONFIG')
  })

  test('rejects arguments instead of swallowing them', async () => {
    // It used to ignore its argv entirely, which made it the one subcommand
    // where a typo looked like it had worked.
    const s = await scenario()
    expect((await s.run(['path', '--nonsense'])).code).toBe(2)
    expect((await s.run(['path', 'extra'])).code).toBe(2)
    expect((await s.run(['path', '--nonsense'])).err).toContain('takes no arguments')
  })

  test('still answers when the project file is broken', async () => {
    // `path` is the command you reach for when a file will not load, so it
    // resolves locations without reading either one.
    const s = await scenario({ projectText: '{ not json' })
    expect((await s.run(['path'])).code).toBe(0)
  })
})

describe("the calling tool's own defaults", () => {
  test("the default layer reports the tool's value, not the library's", async () => {
    // wayfinder runs with allowExec true while the library's DEFAULT_CONFIG says
    // false. Reporting the library's would make `config list` — whose entire
    // job is saying what is in effect — say the opposite of what wayfinder will do.
    const s = await scenario({ defaults: { allowExec: true } })

    expect(rows((await s.run(['list'])).out)['allowExec']).toEqual(['true', '(default)'])
    expect(await s.run(['get', 'allowExec'])).toMatchObject({ code: 0, out: 'true\n' })
  })

  test("a file still beats the tool's default, and is still labelled by its layer", async () => {
    const s = await scenario({
      project: { allowExec: false },
      defaults: { allowExec: true },
    })

    expect(rows((await s.run(['list'])).out)['allowExec']).toEqual(['false', '(project)'])
    expect(await s.run(['get', 'allowExec'])).toMatchObject({ code: 0, out: 'false\n' })
  })

  test("a tool that omits them sees the library's defaults unchanged", async () => {
    const s = await scenario()
    expect(rows((await s.run(['list'])).out)['allowExec']).toEqual(['false', '(default)'])
  })
})

describe('argument mistakes', () => {
  test('set rejects a missing value and an extra positional', async () => {
    const s = await scenario()
    expect((await s.run(['set', 'discovery'])).code).toBe(2)
    expect((await s.run(['set', 'discovery', 'git', 'extra'])).code).toBe(2)
    expect(await missing(s.projectFile)).toBe(true)
  })

  test('--user and --project together are refused, not last-one-wins', async () => {
    // Both are destructive writes, so resolving a contradiction silently would
    // edit whichever file the user did not mean.
    const s = await scenario()
    const ran = await s.run(['set', '--user', '--project', 'discovery', 'git'])

    expect(ran.code).toBe(2)
    expect(ran.err).toContain('--user and --project name different files')
    expect(await missing(s.projectFile)).toBe(true)
    expect(await missing(s.userFile)).toBe(true)
  })

  test('the same flag twice is fine — it is not a contradiction', async () => {
    const s = await scenario()
    expect((await s.run(['set', '--user', '--user', 'discovery', 'git'])).code).toBe(0)
    expect(await readJson(s.userFile)).toEqual({ discovery: 'git' })
  })

  test('set and unset reject an unknown option', async () => {
    const s = await scenario()
    expect((await s.run(['set', '--wat', 'discovery', 'git'])).err).toContain(
      'unknown option: --wat',
    )
    expect((await s.run(['set', '--wat', 'discovery', 'git'])).code).toBe(2)
    expect((await s.run(['unset', '--wat', 'discovery'])).code).toBe(2)
  })

  test('get and unset take exactly one key', async () => {
    const s = await scenario({ project: { discovery: 'walk' } })
    expect((await s.run(['get'])).code).toBe(2)
    expect((await s.run(['get', 'discovery', 'allowExec'])).code).toBe(2)
    expect((await s.run(['unset'])).code).toBe(2)
    expect((await s.run(['unset', 'discovery', 'allowExec'])).code).toBe(2)
    // Nothing was written by the failed unsets.
    expect(await readJson(s.projectFile)).toEqual({ discovery: 'walk' })
  })

  test('list rejects an unknown option', async () => {
    const s = await scenario()
    expect((await s.run(['list', '--wat'])).code).toBe(2)
  })
})

describe('takeConfigDir', () => {
  test('pulls the directory out wherever it appears, leaving the rest', () => {
    expect(takeConfigDir(['path', '-C', '/tmp/x'])).toEqual({ dir: '/tmp/x', rest: ['path'] })
    expect(takeConfigDir(['--dir', '/tmp/x', 'list', '--json'])).toEqual({
      dir: '/tmp/x',
      rest: ['list', '--json'],
    })
  })

  test('is absent when no directory was named, so the caller can default', () => {
    expect(takeConfigDir(['list'])).toEqual({ rest: ['list'] })
  })

  test('a directory flag with no path is an error, not a silent drop', () => {
    expect(takeConfigDir(['path', '-C'])).toEqual({ error: '-C needs a path' })
    expect(takeConfigDir(['--dir'])).toEqual({ error: '--dir needs a path' })
    expect(takeConfigDir(['-C='])).toEqual({ error: '-C needs a path' })
    expect(takeConfigDir(['--dir='])).toEqual({ error: '--dir needs a path' })
  })

  test('the attached spellings commander accepts are accepted here too', () => {
    // The help advertises one `-C, --dir <PATH>`; a user cannot know that a
    // claimed subcommand reads it with a different parser than the main one.
    expect(takeConfigDir(['-C/tmp/x', 'list'])).toEqual({ dir: '/tmp/x', rest: ['list'] })
    expect(takeConfigDir(['-C=/tmp/x', 'list'])).toEqual({ dir: '/tmp/x', rest: ['list'] })
    expect(takeConfigDir(['--dir=/tmp/x', 'list'])).toEqual({ dir: '/tmp/x', rest: ['list'] })
  })
})

describe('dispatch', () => {
  test('--help prints the usage on stdout and exits 0', async () => {
    // The same text on stderr with a non-zero code would read as a failure to
    // a script, which is what asking for help is not.
    const s = await scenario()
    for (const flag of ['--help', '-h']) {
      const ran = await s.run([flag])
      expect(ran.code).toBe(0)
      expect(ran.out).toContain('usage: way config')
      expect(ran.err).toBe('')
    }
  })

  test('no subcommand lists, and an unknown one is a usage error', async () => {
    const s = await scenario()
    expect((await s.run([])).code).toBe(0)

    const bad = await s.run(['frobnicate'])
    expect(bad.code).toBe(2)
    expect(bad.err).toContain('unknown config command: frobnicate')
    expect(bad.err).toContain('usage: way config')
  })

  test("the tool name in messages is the caller's", async () => {
    const s = await scenario()
    let err = ''
    const code = await runConfigCommand('other-tool', s.root, ['get', 'nope'], {
      stdout: () => {},
      stderr: (text) => {
        err += text
      },
      env: {},
      home: s.root,
    })
    expect(code).toBe(1)
    expect(err.startsWith('other-tool: ')).toBe(true)
  })
})
