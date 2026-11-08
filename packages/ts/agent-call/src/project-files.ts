import { mkdir, open, readFile, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import type { ProjectFileEdit } from './plan.js'

const LOCK_SUFFIX = '.agent-call.lock'

/** Thrown when the project file is held by another call or cannot be edited safely. */
export class ProjectFileError extends Error {}

interface LockRecord {
  pid: number
  /** True once the original is captured; absent means nothing was modified yet. */
  captured?: boolean
  /** Original bytes (base64), null when the file did not exist. */
  original?: string | null
  /** The first directory this call created, removed again if still empty. */
  createdDir?: string | null
}

/** Same rule as `@osdlc/file-lock`'s `pidAlive`, kept local to hold the one-dependency rule. */
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function restoreFrom(file: string, record: LockRecord): Promise<void> {
  if (record.captured !== true) return
  if (record.original === null || record.original === undefined) {
    await rm(file, { force: true })
  } else {
    await writeFile(file, Buffer.from(record.original, 'base64'))
  }
}

async function removeDirIfEmpty(dir: string | null | undefined): Promise<void> {
  if (typeof dir === 'string') await rmdir(dir).catch(() => undefined)
}

/**
 * Apply one edit: set `edit.key` in the JSON file `edit.path` (relative to
 * `cwd`), keeping other keys, for as long as the call runs. Returns the
 * function that puts the original bytes back (or deletes what was created).
 *
 * The lock file `<path>.agent-call.lock` is created exclusively and holds the
 * owner pid and the original bytes. A hard kill leaves both files behind; the
 * next call finds a lock whose pid is dead, restores the original from it and
 * takes the lock over.
 *
 * @throws ProjectFileError when another live call holds the lock, or the
 * existing file is not a JSON object.
 */
export async function applyProjectFile(
  cwd: string,
  edit: ProjectFileEdit,
): Promise<() => Promise<void>> {
  const isDir = await stat(cwd).then(
    (s) => s.isDirectory(),
    () => false,
  )
  if (!isDir) throw new ProjectFileError(`working directory ${cwd} does not exist`)
  const file = resolve(cwd, edit.path)
  const lock = file + LOCK_SUFFIX
  const createdDir = (await mkdir(dirname(file), { recursive: true })) ?? null

  let handle
  for (let attempt = 0; ; attempt++) {
    try {
      handle = await open(lock, 'wx')
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        await removeDirIfEmpty(createdDir)
        throw err
      }
      let record: LockRecord | undefined
      try {
        record = JSON.parse(await readFile(lock, 'utf8')) as LockRecord
      } catch {
        record = undefined
      }
      // An empty or garbled lock is a creator that died (or is still writing)
      // between create and write; it is stale only once it has aged.
      const unreadable = record === undefined || typeof record.pid !== 'number'
      const aged =
        unreadable &&
        Date.now() - (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 10_000
      if (unreadable ? !aged : pidAlive(record!.pid)) {
        await removeDirIfEmpty(createdDir)
        throw new ProjectFileError(
          `${edit.path} is in use by another agent-call run in ${cwd}` +
            (record?.pid === undefined ? '' : ` (pid ${record.pid})`) +
            `. If no run is active, check ${edit.path} and delete ${basename(lock)}.`,
        )
      }
      if (attempt > 0) {
        await removeDirIfEmpty(createdDir)
        throw new ProjectFileError(`could not take over the stale lock ${lock}`)
      }
      // Stale: the owner died. Put its original back, then take the lock.
      if (record !== undefined) {
        await restoreFrom(file, record)
        await removeDirIfEmpty(record.createdDir)
      }
      await unlink(lock).catch(() => undefined)
    }
  }

  const record: LockRecord = { pid: process.pid }
  const release = async (): Promise<void> => {
    await restoreFrom(file, record).catch(() => undefined)
    await unlink(lock).catch(() => undefined)
    await removeDirIfEmpty(createdDir)
  }
  try {
    await handle.writeFile(JSON.stringify(record))
    await handle.close()

    let originalBytes: Buffer | null = null
    try {
      originalBytes = await readFile(file)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    let json: Record<string, unknown> = {}
    if (originalBytes !== null) {
      let parsed: unknown
      try {
        parsed = JSON.parse(originalBytes.toString('utf8'))
      } catch {
        parsed = undefined
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ProjectFileError(`${edit.path} exists but is not a JSON object; not touching it`)
      }
      json = parsed as Record<string, unknown>
    }
    record.original = originalBytes === null ? null : originalBytes.toString('base64')
    record.createdDir = createdDir
    record.captured = true
    await writeFile(lock, JSON.stringify(record))
    await writeFile(file, JSON.stringify({ ...json, [edit.key]: edit.value }, null, 2) + '\n')
  } catch (err) {
    await release()
    throw err
  }
  return release
}
