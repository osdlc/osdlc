/** The dotnet ecosystem: solution files and project files. */

import type { EcosystemDef } from '../../tool.ts'

/** Solution files, which group projects. */
export const SOLUTION_FILES = ['*.sln', '*.slnx']

/** Project files, one per C#, F# or Visual Basic project. */
export const PROJECT_FILES = ['*.csproj', '*.fsproj', '*.vbproj']

/**
 * The dotnet ecosystem. A project file's extension names its language, but
 * a language rule matches fixed file names, so none is set.
 */
export const dotnetEcosystem: EcosystemDef = {
  id: 'dotnet',
  manifests: [...SOLUTION_FILES, ...PROJECT_FILES].map((files) => ({ files, tool: 'dotnet' })),
  languages: [],
  tools: ['dotnet'],
}
