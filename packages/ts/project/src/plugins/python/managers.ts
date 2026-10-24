/** The python package managers, highest precedence first: uv, poetry, pip. */

import type { ToolDef } from '../../tool.ts'
import { flagAfterBinary, flagAtEnd } from '../support/shared.ts'
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
      inDir: flagAtEnd('--project'),
      depsDirs: ['.venv'],
    },
  },
}

/** poetry. */
export const poetry: ToolDef = {
  id: 'poetry',
  binary: 'poetry',
  ecosystem: pythonEcosystem,
  roles: {
    packageManager: {
      lockfiles: ['poetry.lock'],
      install: ['poetry', 'install'],
      inDir: flagAfterBinary('--directory'),
    },
  },
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
      // No `inDir`: `-r requirements.txt` is relative to where pip runs.
      install: ['pip', 'install', '-r', 'requirements.txt'],
    },
  },
}
