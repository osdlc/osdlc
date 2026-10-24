/** The jvm ecosystem: maven, gradle and sbt builds. */

import type { EcosystemDef } from '../../tool.ts'

export const POM_XML = 'pom.xml'

/** Gradle build files, in the order preferred as a task's `source`. */
export const GRADLE_FILES: readonly string[] = [
  'build.gradle.kts',
  'build.gradle',
  'settings.gradle.kts',
  'settings.gradle',
]

/**
 * sbt build files, at the root only: sbt subprojects are declared in the
 * root build, so a nested `core/build.sbt` is not a build of its own.
 */
export const SBT_FILES = '*.sbt'

/** The jvm ecosystem. sbt builds are Scala; the rest Java. */
export const jvmEcosystem: EcosystemDef = {
  id: 'jvm',
  manifests: [
    { files: POM_XML, tool: 'maven' },
    ...GRADLE_FILES.map((files) => ({ files, tool: 'gradle' })),
    { files: `/${SBT_FILES}`, tool: 'sbt' },
  ],
  languages: [{ id: 'scala', tools: ['sbt'] }, { id: 'java' }],
  tools: ['maven', 'gradle', 'sbt'],
}
