/**
 * A stand-in for `node:fs` as it behaves on Windows, laid over a real
 * directory, so the Windows path boundary runs on any machine.
 *
 * It accepts only Windows spellings (`C:\x`, `\\server\share\x`): a path with a
 * `/` throws, which proves the host converted it. Drive `X:` lives at
 * `<root>/X`, a share at `<root>/UNC/<server>/<share>`. Drive `Z:` is a mapped
 * network drive: it lives on `\\nas\team`, and `realpath` answers with that
 * share, as Windows does for a mapped drive.
 *
 * As on Windows, `..` stops at the drive or share root, and a drive or share
 * that does not exist cannot be created: `mkdirSync` under it fails with
 * `ENOENT`. A test makes a drive or share exist by creating its directory.
 *
 * Answers that hold a path (`realpathSync.native`, an absolute `readlinkSync`
 * target) come back in Windows spelling. This cannot catch every Windows
 * behaviour; it is not a run on Windows.
 */

import * as nodeFs from 'node:fs'
import path from 'node:path'

import type { NodeFs } from '../src/node-vfs.ts'

const MAPPED: Record<string, string[]> = { Z: ['UNC', 'nas', 'team'] }

const fail = (message: string, code: string) => Object.assign(new Error(message), { code })

/** The parts under a drive or share root, with `.` and `..` folded and clamped at the root. */
function under(rest: string): string[] {
  const parts: string[] = []
  for (const part of rest.split('\\')) {
    if (part === '..') parts.pop()
    else if (part !== '' && part !== '.') parts.push(part)
  }
  return parts
}

/** A drive or share root on the disk under `root`, and the parts below it. */
function locate(root: string, p: string): { volume: string; parts: string[] } {
  if (typeof p !== 'string' || p.includes('/')) {
    throw fail(`not a Windows path: ${String(p)}`, 'EINVAL')
  }
  const drive = /^([A-Za-z]):\\(.*)$/.exec(p)
  if (drive !== null) {
    const letter = drive[1]!.toUpperCase()
    return { volume: path.join(root, ...(MAPPED[letter] ?? [letter])), parts: under(drive[2]!) }
  }
  const unc = /^\\\\([^\\]+)\\([^\\]+)\\?(.*)$/.exec(p)
  if (unc !== null) {
    // Windows takes no `.` or `..` as a server or share name.
    if ([unc[1], unc[2]].some((name) => name === '.' || name === '..')) {
      throw fail(`not a share: ${p}`, 'EINVAL')
    }
    return { volume: path.join(root, 'UNC', unc[1]!, unc[2]!), parts: under(unc[3]!) }
  }
  throw fail(`not a full Windows path: ${p}`, 'EINVAL')
}

export function fakeWindowsFs(root: string): NodeFs {
  const real = (p: string): string => {
    const { volume, parts } = locate(root, p)
    return path.join(volume, ...parts)
  }

  const back = (posix: string): string => {
    const parts = path.relative(root, posix).split(path.sep).filter(Boolean)
    if (parts[0] === 'UNC') return `\\\\${parts.slice(1).join('\\')}`
    return `${parts[0]}:\\${parts.slice(1).join('\\')}`
  }

  const realpath = Object.assign((p: string) => back(nodeFs.realpathSync.native(real(p))), {
    native: (p: string) => back(nodeFs.realpathSync.native(real(p))),
  })

  const fake = {
    readFileSync: (p: string) => nodeFs.readFileSync(real(p)),
    readdirSync: (p: string, options: { withFileTypes: true }) =>
      nodeFs.readdirSync(real(p), options),
    writeFileSync: (p: string, data: Uint8Array) => nodeFs.writeFileSync(real(p), data),
    mkdirSync: (p: string, options: { recursive: true }) => {
      if (!nodeFs.existsSync(locate(root, p).volume)) {
        throw fail(`ENOENT: no such drive or share, mkdir '${p}'`, 'ENOENT')
      }
      return nodeFs.mkdirSync(real(p), options)
    },
    existsSync: (p: string) => nodeFs.existsSync(real(p)),
    statSync: (p: string) => nodeFs.statSync(real(p)),
    chmodSync: (p: string, mode: number) => nodeFs.chmodSync(real(p), mode),
    lstatSync: (p: string, options?: { throwIfNoEntry: false }) =>
      nodeFs.lstatSync(real(p), options),
    renameSync: (from: string, to: string) => nodeFs.renameSync(real(from), real(to)),
    rmSync: (p: string, options: { recursive: true }) => nodeFs.rmSync(real(p), options),
    unlinkSync: (p: string) => nodeFs.unlinkSync(real(p)),
    realpathSync: realpath,
    readlinkSync: (p: string) => {
      const target = nodeFs.readlinkSync(real(p))
      return path.isAbsolute(target) ? back(target) : target.split('/').join('\\')
    },
  }
  return fake as unknown as NodeFs
}

/** Where a Windows path lives on the real disk under `root`. */
export function onDisk(root: string, windowsPath: string): string {
  const { volume, parts } = locate(root, windowsPath)
  return path.join(volume, ...parts)
}

/** Make drives and shares exist, by creating their directories. */
export function mount(root: string, ...volumes: string[]): void {
  for (const volume of volumes) nodeFs.mkdirSync(locate(root, volume).volume, { recursive: true })
}
