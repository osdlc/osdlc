---
slug: eclipse
category: editor
vendor: Eclipse Foundation
homepage: https://eclipseide.org/
docs: https://help.eclipse.org/latest/
repository: https://github.com/eclipse-platform/eclipse.platform
license: EPL-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: eclipse
checked: '2026-11-21'
sources:
- '[AgentManagerImpl.java](../documents/Eclipse%20Oomph/AgentManagerImpl.java.md)'
- '[AgentImpl.java](../documents/Eclipse%20Oomph/AgentImpl.java.md)'
- '[Bundle Pool Management](../documents/Eclipse%20Oomph/Bundle%20Pool%20Management.md)'
- '[Resources and the file system](../documents/Eclipse/Resources%20and%20the%20file%20system.md)'
- '[Eclipse runtime options](../documents/Eclipse/Eclipse%20runtime%20options.md)'
- '[Minimizing Data Loss From Crashes](../documents/Eclipse/Minimizing%20Data%20Loss%20From%20Crashes.md)'
---

Eclipse is an open-source IDE built on OSGi and installed through p2. Installations made with the Eclipse Installer (Oomph) share a p2 agent and bundle pool under ~/.p2 that accumulates unused plug-ins as installs are updated or removed, and each workspace keeps a .metadata directory of platform state.
