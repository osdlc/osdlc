/** `@osdlc/system-model/jvm`: the jvm ecosystem, gradle, maven and sbt. */

import type { ToolDef } from '../../tool.ts'
import { jvmEcosystem } from './ecosystem.ts'
import { gradleRunner, GRADLE_BRAND } from './gradle.ts'
import { mavenRunner, MAVEN_BRAND } from './maven.ts'
import { sbtRunner, VERSION_MARKER, SBT_BRAND } from './sbt.ts'

/** gradle: tasks from the build, or the conventional ones. */
export const gradle: ToolDef = {
  id: 'gradle',
  homepage: 'https://gradle.org',
  description: 'A build tool for the JVM, Android and other platforms.',
  brand: GRADLE_BRAND,
  // A wrapper build (the common case) runs `./gradlew`, not this binary. So
  // the report's `tool.found` means "bare gradle is on PATH", not "this
  // repository's build can run".
  binary: 'gradle',
  ecosystem: jvmEcosystem,
  roles: { runner: gradleRunner },
}

/** maven: the conventional lifecycle phases of a `pom.xml`. */
export const maven: ToolDef = {
  id: 'maven',
  homepage: 'https://maven.apache.org',
  description: 'A build tool and dependency manager for Java.',
  brand: MAVEN_BRAND,
  binary: 'mvn',
  ecosystem: jvmEcosystem,
  roles: { runner: mavenRunner },
}

/** sbt: tasks listed by sbt itself, which needs execution. */
export const sbt: ToolDef = {
  id: 'sbt',
  homepage: 'https://www.scala-sbt.org',
  description: 'A build tool for Scala and Java.',
  brand: SBT_BRAND,
  binary: 'sbt',
  ecosystem: jvmEcosystem,
  markers: [{ files: `/${VERSION_MARKER}`, tier: 'files' }],
  roles: { runner: sbtRunner },
}

/** Every tool this plugin defines. */
export const jvmTools: readonly ToolDef[] = [gradle, maven, sbt]

export { jvmEcosystem }
