/**
 * `@osdlc/system-model/python`: the python ecosystem, uv, poetry, pip, the
 * pyproject runner, and the Poe the Poet, PDM and Hatch task runners.
 */

import type { Evidence } from '../../aspect.ts'
import { evidence } from '../../model.ts'
import type { Package, ToolDef } from '../../tool.ts'
import { pythonEcosystem } from './ecosystem.ts'
import { HATCH_BRAND, HATCH_TOML, hatchRunner } from './hatch.ts'
import { pip, poetry, uv } from './managers.ts'
import { PDM_BRAND, pdmRunner } from './pdm.ts'
import { POE_BRAND, POE_FILES, poeRunner } from './poe.ts'
import { pythonRunner, PYTHON_BRAND } from './python.ts'

/**
 * Tools a pyproject.toml configures, and the scripts it declares. No
 * `binary`: each task runs its own tool, or uv or poetry for a script.
 */
export const python: ToolDef = {
  id: 'python',
  homepage: 'https://packaging.python.org/en/latest/specifications/pyproject-toml/',
  description: 'The scripts and tool tables a pyproject.toml declares.',
  brand: PYTHON_BRAND,
  ecosystem: pythonEcosystem,
  roles: { runner: pythonRunner },
}

/** Evidence for each pyproject.toml with a `[tool.<name>]` table. */
function toolTable(name: string): NonNullable<ToolDef['detect']> {
  return async (_ctx, packages: readonly Package[]) => {
    const out: Evidence[] = []
    for (const pkg of packages) {
      const fact = pkg.manifests.pyproject
      if (fact?.tools.includes(name) !== true) continue
      out.push(evidence('manifest', `${fact.manifestPath}#tool.${name}`, `tool.${name}`))
    }
    return out
  }
}

/**
 * Poe the Poet: tasks from `[tool.poe.tasks]` or a `poe_tasks.*` file, run
 * through uv or poetry when one manages the package.
 */
export const poe: ToolDef = {
  id: 'poe',
  homepage: 'https://poethepoet.natn.io',
  description: 'A task runner for the tasks a pyproject.toml or poe_tasks file declares.',
  brand: POE_BRAND,
  binary: 'poe',
  ecosystem: pythonEcosystem,
  markers: POE_FILES.map((name) => ({ files: name, tier: 'files' })),
  detect: toolTable('poe'),
  roles: { runner: poeRunner },
}

/** PDM: scripts from `[tool.pdm.scripts]`. */
export const pdm: ToolDef = {
  id: 'pdm',
  homepage: 'https://pdm-project.org',
  description: 'A Python package and dependency manager that runs the scripts a project declares.',
  brand: PDM_BRAND,
  binary: 'pdm',
  ecosystem: pythonEcosystem,
  detect: toolTable('pdm'),
  roles: { runner: pdmRunner },
}

/** Hatch: each environment's scripts, from pyproject.toml or hatch.toml. */
export const hatch: ToolDef = {
  id: 'hatch',
  homepage: 'https://hatch.pypa.io',
  description: 'A Python project manager that runs scripts in its environments.',
  brand: HATCH_BRAND,
  binary: 'hatch',
  ecosystem: pythonEcosystem,
  markers: [{ files: HATCH_TOML, tier: 'files' }],
  detect: toolTable('hatch'),
  roles: { runner: hatchRunner },
}

/** Every tool this plugin defines. */
export const pythonTools: readonly ToolDef[] = [uv, poetry, pip, python, poe, pdm, hatch]

export { pip, poetry, pythonEcosystem, uv }
