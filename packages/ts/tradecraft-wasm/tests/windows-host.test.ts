/**
 * The core over a Windows-shaped host, with `node:fs` replaced by a stand-in
 * that accepts only Windows spellings (`test/fake-windows-fs.ts`). This does
 * not run on Windows; it checks the path boundary on any machine.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { fakeWindowsFs, mount, onDisk } from './fake-windows-fs.ts'
import { exportSkills, publishSkill } from '../src/core.ts'
import { toCorePath, UNSUPPORTED_PATH } from '../src/host-path.ts'
import { createNodeVfs, type Vfs } from '../src/node-vfs.ts'

let root: string
let vfs: Vfs

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'tradecraft-windows-')))
  vfs = createNodeVfs({ platform: 'win32', fs: fakeWindowsFs(root) })
  mount(root, 'C:\\', 'D:\\', 'Z:\\', '\\\\server\\share')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const core = (windowsPath: string) => toCorePath(windowsPath, 'win32')

/** A vault at `vault` (a Windows path) with one marketplace and one skill. */
function vaultAt(vault: string, disk: (p: string) => string = (p) => onDisk(root, p)): string {
  const skill = path.join(disk(vault), 'marketplaces/house/plugins/tools/skills/review')
  mkdirSync(skill, { recursive: true })
  writeFileSync(
    path.join(disk(vault), 'marketplaces/house/house.md'),
    '---\nname: house\ndescription: The house marketplace.\nap-owner: acme\n---\n',
  )
  writeFileSync(
    path.join(skill, 'review.md'),
    '---\nname: review\ndescription: Reviews a diff.\n---\n\n# Review\n',
  )
  return `${vault}\\marketplaces\\house\\plugins\\tools\\skills\\review\\review.md`
}

function publish(note: string, vault: string, destination: string) {
  return publishSkill(vfs, {
    skill_path: core(note),
    destination_root: core(destination),
    target: 'claude',
    skills_root: core(vault),
  })
}

function build(vault: string, out: string) {
  return exportSkills(vfs, {
    vault_root: core(vault),
    out_root: core(out),
    mode: 'build',
    config: { default_plugin: 'core' },
  })
}

describe('a Windows host', () => {
  test('publishes, and publishes again over its own files', () => {
    const note = vaultAt('C:\\Users\\me\\vault')
    const first = publish(note, 'C:\\Users\\me\\vault', 'D:\\dest')
    expect(
      first.files.some((f) => f.path.endsWith('review/SKILL.md') && f.status === 'written'),
    ).toBe(true)
    expect(existsSync(onDisk(root, 'D:\\dest\\.claude\\skills\\review\\SKILL.md'))).toBe(true)

    const again = publish(note, 'C:\\Users\\me\\vault', 'D:\\dest')
    expect(again.files.every((f) => f.status !== 'refused')).toBe(true)
  })

  test('builds at the repository root that holds the vault', () => {
    vaultAt('C:\\repo\\src')
    expect(build('C:\\repo\\src', 'C:\\repo').changed).toBe(true)
    expect(existsSync(onDisk(root, 'C:\\repo\\.claude-plugin\\marketplace.json'))).toBe(true)
  })

  test('refuses a build whose replaced tree is a link into the vault', () => {
    vaultAt('C:\\linked\\src')
    mkdirSync(onDisk(root, 'C:\\linked\\src\\skills'))
    symlinkSync(onDisk(root, 'C:\\linked\\src\\skills'), onDisk(root, 'C:\\linked\\.claude-plugin'))
    expect(() => build('C:\\linked\\src', 'C:\\linked')).toThrow(/would write .* inside the vault/)
  })

  test('compares whole components: a sibling named like the vault is not inside it', () => {
    vaultAt('C:\\vault')
    expect(build('C:\\vault', 'C:\\vault-bee').changed).toBe(true)
    expect(() => build('C:\\vault', 'C:\\vault\\out')).toThrow(/inside the vault/)
  })

  test('works on a UNC share, and on a mapped drive that resolves to one', () => {
    const shareDisk = (p: string) => path.join(root, 'UNC', ...p.slice(2).split('\\'))
    const note = vaultAt('\\\\server\\share\\vault', shareDisk)
    expect(
      publish(note, '\\\\server\\share\\vault', '\\\\server\\share\\dest').files.length,
    ).toBeGreaterThan(0)

    // Drive Z: is mapped to \\nas\team; realpath answers with the share.
    const mapped = vaultAt('Z:\\vault')
    publish(mapped, 'Z:\\vault', 'Z:\\dest')
    expect(existsSync(onDisk(root, 'Z:\\dest\\.claude\\skills\\review\\SKILL.md'))).toBe(true)
  })

  test('refuses a server name as a root: it is not a directory', () => {
    const note = vaultAt('C:\\vault')
    for (const server of ['\\\\server', '\\\\server\\']) {
      expect(() => publish(note, 'C:\\vault', server)).toThrow(
        expect.objectContaining({ code: UNSUPPORTED_PATH }),
      )
      expect(() => build('C:\\vault', server)).toThrow(
        expect.objectContaining({ code: UNSUPPORTED_PATH }),
      )
    }
    expect(existsSync(path.join(root, 'UNC', 'server', '.claude'))).toBe(false)
  })

  test('refuses `..` as a share name before anything is written', () => {
    vaultAt('C:\\vault')
    // Folded as text, this would name `/UNC/share`, a server and not a share.
    expect(() => build('C:\\vault', '\\\\server\\..\\share')).toThrow(
      expect.objectContaining({ code: UNSUPPORTED_PATH }),
    )
    expect(existsSync(path.join(root, 'UNC', 'share'))).toBe(false)
  })

  test('a `..` at a share root stays on that share, as on Windows', () => {
    vaultAt('C:\\vault')
    expect(build('C:\\vault', '\\\\server\\share\\..\\share2\\out').changed).toBe(true)
    expect(
      existsSync(onDisk(root, '\\\\server\\share\\share2\\out\\.claude-plugin\\marketplace.json')),
    ).toBe(true)
  })

  test.each([
    // A volume with no drive letter: as libuv answers it, and as Windows does
    // before libuv strips the \\?\ prefix.
    ['\\\\?\\Volume{0b6a5c1e}\\dest', /is not a drive or share path/],
    ['Volume{0b6a5c1e}\\dest', /depends on the current directory/],
  ])('refuses the realpath answer %s, which is not a drive or share path', (answer, why) => {
    const fake = fakeWindowsFs(root)
    const volume = (p: string) => (p.startsWith('D:\\dest') ? answer : fake.realpathSync.native(p))
    const odd = createNodeVfs({
      platform: 'win32',
      fs: { ...fake, realpathSync: Object.assign(volume, { native: volume }) } as typeof fake,
    })
    const note = vaultAt('C:\\vault')
    const result = publishSkill(odd, {
      skill_path: core(note),
      destination_root: core('D:\\dest'),
      target: 'claude',
      skills_root: core('C:\\vault'),
    })
    expect(result.files.map((f) => f.status)).toEqual(['refused'])
    expect(result.files[0]?.reason?.detail).toMatch(/cannot tell where this path leads/)
    expect(result.files[0]?.reason?.detail).toMatch(why)
  })
})
