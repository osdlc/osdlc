/**
 * The `clean` subcommand.
 *
 * Every test injects its own `home` and an empty `env`. A test that let either
 * default would report on — and then DELETE — the developer's real cache, trust
 * store and configuration, which is the one mistake this command must never
 * make on anyone's machine, including ours.
 */
import { describe, expect, test } from 'vitest'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { runCleanCommand } from '../src/clean-command.ts'
import { fixtureRoot, removeRoot } from './support.ts'

/** A home with all three stores populated, at the paths the resolvers pick. */
async function populatedHome(): Promise<string> {
  const home = await fixtureRoot({})
  await mkdir(join(home, '.cache', 'wayfinder', 'reports', 'v2'), { recursive: true })
  await writeFile(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'), '{}', 'utf-8')
  await mkdir(join(home, '.local', 'state', 'wayfinder', 'trusted'), { recursive: true })
  await writeFile(join(home, '.local', 'state', 'wayfinder', 'trusted', 'repo-abc'), '', 'utf-8')
  await mkdir(join(home, '.config', 'wayfinder'), { recursive: true })
  await writeFile(join(home, '.config', 'wayfinder', 'config.json'), '{}', 'utf-8')
  return home
}

function capture(home: string) {
  const out: string[] = []
  const err: string[] = []
  return {
    out,
    err,
    io: {
      stdout: (t: string) => void out.push(t),
      stderr: (t: string) => void err.push(t),
      env: {} as Record<string, string | undefined>,
      home,
    },
  }
}

const exists = async (path: string): Promise<boolean> =>
  await stat(path).then(
    () => true,
    () => false,
  )

describe('clean', () => {
  test('with no flags it reports and removes nothing', async () => {
    // The whole point: a command about deleting things must not delete by
    // default, and the safe behaviour must not sit behind a --dry-run people
    // forget to pass.
    const home = await populatedHome()
    try {
      const { out, io } = capture(home)
      expect(await runCleanCommand('wayfinder', [], io)).toBe(0)

      const text = out.join('')
      expect(text).toContain('--cache')
      expect(text).toContain('--trust')
      expect(text).toContain('--config')
      expect(text).toContain('Nothing was removed')
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(true)
      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(true)
    } finally {
      await removeRoot(home)
    }
  })

  test('--cache removes only the cache', async () => {
    const home = await populatedHome()
    try {
      const { io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--cache'], io)).toBe(0)

      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(false)
      expect(await exists(join(home, '.local', 'state', 'wayfinder', 'trusted', 'repo-abc'))).toBe(
        true,
      )
      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(true)
    } finally {
      await removeRoot(home)
    }
  })

  test('--trust forgets grants and says they will be asked for again', async () => {
    const home = await populatedHome()
    try {
      const { out, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--trust'], io)).toBe(0)

      expect(await exists(join(home, '.local', 'state', 'wayfinder', 'trusted', 'repo-abc'))).toBe(
        false,
      )
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(true)
      expect(out.join('')).toContain('will ask again')
    } finally {
      await removeRoot(home)
    }
  })

  test('--config refuses without --yes, and the file survives the refusal', async () => {
    // The config is the only thing here a person WROTE; nothing regenerates it.
    const home = await populatedHome()
    try {
      const { err, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--config'], io)).toBe(2)

      expect(err.join('')).toContain('--yes')
      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(true)
    } finally {
      await removeRoot(home)
    }
  })

  test('--config --yes removes it, and takes the emptied directory with it', async () => {
    const home = await populatedHome()
    try {
      const { io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--config', '--yes'], io)).toBe(0)

      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(false)
      expect(await exists(join(home, '.config', 'wayfinder'))).toBe(false)
    } finally {
      await removeRoot(home)
    }
  })

  test('--all needs --yes too, since it includes the config', async () => {
    const home = await populatedHome()
    try {
      const { io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--all'], io)).toBe(2)
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(true)

      const second = capture(home)
      expect(await runCleanCommand('wayfinder', ['--all', '--yes'], second.io)).toBe(0)
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(false)
      expect(await exists(join(home, '.local', 'state', 'wayfinder', 'trusted', 'repo-abc'))).toBe(
        false,
      )
      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(false)
    } finally {
      await removeRoot(home)
    }
  })

  test('an empty store is reported, not an error', async () => {
    // A second `clean --cache` must be a no-op rather than a failure: the
    // desired state is already the actual one.
    const home = await fixtureRoot({})
    try {
      const { out, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--cache'], io)).toBe(0)
      expect(out.join('')).toContain('nothing stored')
    } finally {
      await removeRoot(home)
    }
  })

  test('XDG overrides are honoured, so the stores are found where the user put them', async () => {
    const home = await fixtureRoot({})
    try {
      const elsewhere = join(home, 'xdg-cache')
      await mkdir(join(elsewhere, 'wayfinder'), { recursive: true })
      await writeFile(join(elsewhere, 'wayfinder', 'a.json'), '{}', 'utf-8')

      const { io } = capture(home)
      io.env['XDG_CACHE_HOME'] = elsewhere
      expect(await runCleanCommand('wayfinder', ['--cache'], io)).toBe(0)
      expect(await exists(join(elsewhere, 'wayfinder', 'a.json'))).toBe(false)
    } finally {
      await removeRoot(home)
    }
  })

  test('an unknown option is refused rather than ignored', async () => {
    const home = await fixtureRoot({})
    try {
      const { err, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--everything'], io)).toBe(2)
      expect(err.join('')).toContain('unknown option')
    } finally {
      await removeRoot(home)
    }
  })
})

/**
 * The machine form.
 *
 * `clean` is the command whose human output is furthest from a data structure —
 * a paragraph, a padded two-line block per store, and a closing sentence — so
 * it is the one a script had no way to read.
 */
describe('clean --json', () => {
  /** The parsed `stores` array from a run's stdout, which is one document. */
  function stores(out: string[]): Array<{
    key: string
    flag: string
    what: string
    path: string
    bytes: number | null
    removed: boolean
  }> {
    expect(out).toHaveLength(1)
    return (JSON.parse(out.join('')) as { stores: ReturnType<typeof stores> }).stores
  }

  test('a bare report names all three stores and removes nothing', async () => {
    const home = await populatedHome()
    try {
      const { out, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--json'], io)).toBe(0)

      const rows = stores(out)
      expect(rows.map((r) => r.key)).toEqual(['cache', 'trust', 'config'])
      // The flag that removes each store rides along, so a caller reading the
      // report knows how to act on it without a second lookup.
      expect(rows.map((r) => r.flag)).toEqual(['--cache', '--trust', '--config'])
      expect(rows.every((r) => r.removed === false)).toBe(true)
      expect(rows.every((r) => typeof r.bytes === 'number')).toBe(true)
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(true)
    } finally {
      await removeRoot(home)
    }
  })

  test('a removal answers with only the stores it was asked about', async () => {
    const home = await populatedHome()
    try {
      const { out, err, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--cache', '--json'], io)).toBe(0)

      const rows = stores(out)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ key: 'cache', removed: true })
      expect(rows[0]?.bytes).toBeGreaterThan(0)
      expect(await exists(join(home, '.cache', 'wayfinder', 'reports', 'v2', 'a.json'))).toBe(false)
      expect(err).toEqual([])
    } finally {
      await removeRoot(home)
    }
  })

  test('an empty store is bytes null and removed false, not an omission', async () => {
    // "Nothing was there" and "it would not delete" are different answers, and
    // both are `removed: false` — the size is what separates them.
    const home = await fixtureRoot({})
    try {
      const { out, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--cache', '--json'], io)).toBe(0)
      expect(stores(out)[0]).toMatchObject({ key: 'cache', bytes: null, removed: false })
    } finally {
      await removeRoot(home)
    }
  })

  test('the trust aside goes to stderr, leaving stdout one parseable object', async () => {
    const home = await populatedHome()
    try {
      const { out, err, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--trust', '--json'], io)).toBe(0)

      expect(stores(out)[0]).toMatchObject({ key: 'trust', removed: true })
      expect(err.join('')).toContain('will ask again')
    } finally {
      await removeRoot(home)
    }
  })

  test('the --yes guard still refuses, and prints no document to parse', async () => {
    // There is no answer to hand back, so stdout stays empty rather than
    // carrying a document about a run that never happened.
    const home = await populatedHome()
    try {
      const { out, err, io } = capture(home)
      expect(await runCleanCommand('wayfinder', ['--config', '--json'], io)).toBe(2)
      expect(out).toEqual([])
      expect(err.join('')).toContain('--yes')
      expect(await exists(join(home, '.config', 'wayfinder', 'config.json'))).toBe(true)
    } finally {
      await removeRoot(home)
    }
  })
})
