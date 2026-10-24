/**
 * The node package managers. Each one's run verb and directory flag differ:
 * `npm run --prefix <dir>`, `pnpm run --dir <dir>`, `bun run --cwd <dir>`,
 * `yarn --cwd <dir>` (yarn 1; Berry dropped `--cwd`, and a lockfile does not
 * say which yarn wrote it).
 */

import { evidence, type Evidence } from '../../model.ts'
import type { Package, PackageManagerRole, ToolDef } from '../../tool.ts'
import { flagAfterBinary } from '../support/shared.ts'
import { nodeEcosystem } from './ecosystem.ts'

/** The `packageManager` field names this manager: the strongest evidence there is. */
function pinDetect(id: string): ToolDef['detect'] {
  return async (_ctx, packages) => {
    const out: Evidence[] = []
    for (const pkg of packages) {
      const fact = pkg.manifests.packageJson
      const pin = fact?.packageManagerPin
      if (fact === undefined || pin?.manager !== id) continue
      out.push(
        evidence(
          'manifest',
          `${fact.manifestPath}#packageManager`,
          `${pin.manager}@${pin.version}`,
        ),
      )
    }
    return out
  }
}

function pinOf(id: string): PackageManagerRole['pin'] {
  return (pkg: Package) => {
    const pin = pkg.manifests.packageJson?.packageManagerPin
    return pin?.manager === id ? pin.version : undefined
  }
}

const NODE_MODULES = 'node_modules'

/** bun. */
export const bun: ToolDef = {
  id: 'bun',
  binary: 'bun',
  commandWords: ['bunx'],
  ecosystem: nodeEcosystem,
  detect: pinDetect('bun'),
  roles: {
    packageManager: {
      lockfiles: ['bun.lock', 'bun.lockb'],
      install: ['bun', 'install'],
      frozen: ['--frozen-lockfile'],
      inDir: flagAfterBinary('--cwd'),
      depsDirs: [NODE_MODULES],
      pin: pinOf('bun'),
      run: { verb: ['bun', 'run'], dirFlag: '--cwd' },
    },
  },
}

/** pnpm. A `pnpm-workspace.yaml` selects it as surely as its lockfile. */
export const pnpm: ToolDef = {
  id: 'pnpm',
  binary: 'pnpm',
  ecosystem: nodeEcosystem,
  markers: [{ files: 'pnpm-workspace.yaml', tier: 'files' }],
  detect: pinDetect('pnpm'),
  roles: {
    packageManager: {
      lockfiles: ['pnpm-lock.yaml'],
      install: ['pnpm', 'install'],
      frozen: ['--frozen-lockfile'],
      inDir: flagAfterBinary('--dir'),
      depsDirs: [NODE_MODULES],
      pin: pinOf('pnpm'),
      run: { verb: ['pnpm', 'run'], dirFlag: '--dir' },
    },
  },
}

/** yarn. Plug'n'Play installs no `node_modules`; its `.pnp.cjs` shows an install. */
export const yarn: ToolDef = {
  id: 'yarn',
  binary: 'yarn',
  ecosystem: nodeEcosystem,
  detect: pinDetect('yarn'),
  roles: {
    packageManager: {
      lockfiles: ['yarn.lock'],
      install: ['yarn', 'install'],
      frozen: ['--frozen-lockfile'],
      inDir: flagAfterBinary('--cwd'),
      depsDirs: [NODE_MODULES, '.pnp.cjs'],
      pin: pinOf('yarn'),
      run: { verb: ['yarn'], dirFlag: '--cwd' },
    },
  },
}

/** npm. `npm ci` is already frozen; with no lockfile it is `npm install`. */
export const npm: ToolDef = {
  id: 'npm',
  binary: 'npm',
  ecosystem: nodeEcosystem,
  detect: pinDetect('npm'),
  roles: {
    packageManager: {
      lockfiles: ['package-lock.json'],
      install: ['npm', 'ci'],
      installUnlocked: ['npm', 'install'],
      frozen: [],
      inDir: flagAfterBinary('--prefix'),
      depsDirs: [NODE_MODULES],
      pin: pinOf('npm'),
      run: { verb: ['npm', 'run'], dirFlag: '--prefix', separator: true },
    },
  },
}

/** The node package managers, highest precedence first. */
export const NODE_MANAGERS: readonly ToolDef[] = [bun, pnpm, yarn, npm]
