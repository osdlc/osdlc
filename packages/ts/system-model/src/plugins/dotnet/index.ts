/** `@osdlc/system-model/dotnet`: the dotnet ecosystem and the dotnet CLI. */

import type { ToolDef } from '../../tool.ts'
import { DOTNET_BRAND, dotnetRunner } from './dotnet.ts'
import { dotnetEcosystem } from './ecosystem.ts'

/** dotnet: the conventional verbs of each solution and project file. */
export const dotnet: ToolDef = {
  id: 'dotnet',
  homepage: 'https://dotnet.microsoft.com',
  description: 'The .NET command line, which builds, tests and runs .NET projects.',
  brand: DOTNET_BRAND,
  binary: 'dotnet',
  ecosystem: dotnetEcosystem,
  roles: { runner: dotnetRunner },
}

/** Every tool this plugin defines. */
export const dotnetTools: readonly ToolDef[] = [dotnet]

export { dotnetEcosystem }
