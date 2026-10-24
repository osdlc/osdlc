/** `@osdlc/project/python`: the python ecosystem, uv, poetry, pip and the pyproject runner. */

import type { ToolDef } from '../../tool.ts'
import { pythonEcosystem } from './ecosystem.ts'
import { pip, poetry, uv } from './managers.ts'
import { pythonRunner } from './python.ts'

/** Tools a pyproject.toml configures, and the scripts it declares. */
export const python: ToolDef = {
  id: 'python',
  ecosystem: pythonEcosystem,
  roles: { runner: pythonRunner },
}

/** Every tool this plugin defines. */
export const pythonTools: readonly ToolDef[] = [uv, poetry, pip, python]

export { pip, poetry, pythonEcosystem, uv }
