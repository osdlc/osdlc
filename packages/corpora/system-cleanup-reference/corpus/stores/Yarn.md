---
slug: yarn
category: language-package-manager
vendor: Yarn Contributors
homepage: https://yarnpkg.com
docs: https://yarnpkg.com/getting-started
repository: https://github.com/yarnpkg/berry
license: BSD-2-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: yarn
checked: '2026-11-21'
sources:
- '[Settings (.yarnrc.yml)](../documents/Yarn/Settings%20%28.yarnrc.yml%29.md)'
- '[packages yarnpkg-core sources folderUtils.ts](../documents/Yarn/packages%20yarnpkg-core%20sources%20folderUtils.ts.md)'
- '[packages yarnpkg-core sources Configuration.ts](../documents/Yarn/packages%20yarnpkg-core%20sources%20Configuration.ts.md)'
- '[yarn cache (Classic)](../documents/Yarn/yarn%20cache%20%28Classic%29.md)'
- '[src util user-dirs.js (Yarn 1)](../documents/Yarn/src%20util%20user-dirs.js%20%28Yarn%201%29.md)'
- '[yarn cache clean](../documents/Yarn/yarn%20cache%20clean.md)'
- '[Questions & Answers](../documents/Yarn/Questions%20%26%20Answers.md)'
- '[Yarn Plug''n''Play](../documents/Yarn/Yarn%20Plug%27n%27Play.md)'
---

Yarn is a Node.js package manager. Modern Yarn (Berry, 2+) keeps zip archives of every package in a global cache under its global folder (~/.yarn/berry/cache) and writes a PnP loader or node_modules into each project; Yarn 1 (Classic) keeps a global cache in the OS cache directory.

## Open

- in use: Yarn docs name no lock file or daemon marking the cache in use; the yarnrc page says the cache is safe to share between Yarn instances running at the same time.
