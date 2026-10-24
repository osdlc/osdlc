/** The python package managers, highest precedence first: uv, poetry, pip. */

import type { ToolDef } from '../../tool.ts'
import { pythonEcosystem } from './ecosystem.ts'

/** uv. */
export const uv: ToolDef = {
  id: 'uv',
  binary: 'uv',
  commandWords: ['uvx'],
  ecosystem: pythonEcosystem,
  roles: {
    packageManager: {
      lockfiles: ['uv.lock'],
      install: ['uv', 'sync'],
      frozen: ['--locked'],
      depsDirs: ['.venv'],
    },
  },
}

/** poetry. */
export const poetry: ToolDef = {
  id: 'poetry',
  binary: 'poetry',
  ecosystem: pythonEcosystem,
  roles: { packageManager: { lockfiles: ['poetry.lock'], install: ['poetry', 'install'] } },
}

/** pip, selected by a `requirements.txt`. */
export const pip: ToolDef = {
  id: 'pip',
  binary: 'pip',
  commandWords: ['pip3'],
  ecosystem: pythonEcosystem,
  roles: {
    packageManager: {
      lockfiles: ['requirements.txt'],
      install: ['pip', 'install', '-r', 'requirements.txt'],
    },
  },
}
