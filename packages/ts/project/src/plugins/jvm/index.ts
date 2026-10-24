/** `@osdlc/project/jvm`: the jvm ecosystem, gradle, maven and sbt. */

import type { ToolDef } from '../../tool.ts'
import { jvmEcosystem } from './ecosystem.ts'
import { gradleRunner } from './gradle.ts'
import { mavenRunner } from './maven.ts'
import { sbtRunner, VERSION_MARKER } from './sbt.ts'

/** gradle: tasks from the build, or the conventional ones. */
export const gradle: ToolDef = {
  id: 'gradle',
  binary: 'gradle',
  ecosystem: jvmEcosystem,
  roles: { runner: gradleRunner },
}

/** maven: the conventional lifecycle phases of a `pom.xml`. */
export const maven: ToolDef = {
  id: 'maven',
  binary: 'mvn',
  ecosystem: jvmEcosystem,
  roles: { runner: mavenRunner },
}

/** sbt: tasks listed by sbt itself, which needs execution. */
export const sbt: ToolDef = {
  id: 'sbt',
  binary: 'sbt',
  ecosystem: jvmEcosystem,
  markers: [{ files: `/${VERSION_MARKER}`, tier: 'files' }],
  roles: { runner: sbtRunner },
}

/** Every tool this plugin defines. */
export const jvmTools: readonly ToolDef[] = [gradle, maven, sbt]

export { jvmEcosystem }
