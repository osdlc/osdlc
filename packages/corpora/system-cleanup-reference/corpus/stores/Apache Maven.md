---
slug: maven
category: build-tool
vendor: The Apache Software Foundation
homepage: https://maven.apache.org
docs: https://maven.apache.org/guides/
repository: https://github.com/apache/maven
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: mvn
checked: '2026-11-21'
sources:
- '[Settings Reference](../documents/Apache%20Maven/Settings%20Reference.md)'
- '[Maven Local Repositories](../documents/Apache%20Maven/Maven%20Local%20Repositories.md)'
- '[Guide to Configuring Maven](../documents/Apache%20Maven/Guide%20to%20Configuring%20Maven.md)'
- '[dependency purge-local-repository](../documents/Apache%20Maven/dependency%20purge-local-repository.md)'
- '[Apache Maven Clean Plugin](../documents/Apache%20Maven/Apache%20Maven%20Clean%20Plugin.md)'
- '[Configuration Options - Maven Resolver](../documents/Apache%20Maven/Configuration%20Options%20-%20Maven%20Resolver.md)'
- '[Named Locks - Maven Resolver](../documents/Apache%20Maven/Named%20Locks%20-%20Maven%20Resolver.md)'
- '[Apache Maven POM Reference](../documents/Apache%20Maven/Apache%20Maven%20POM%20Reference.md)'
---

Apache Maven is a build tool for Java projects. It caches every downloaded artifact (and every locally installed one) in the local repository at ~/.m2/repository, which grows without bound, and writes build output to target/ in each project.

## Open

- inventory command: Maven documents no command that lists or sizes the local repository.
