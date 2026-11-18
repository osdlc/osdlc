---
'@osdlc/agent-seat': patch
---

README: say why `engines.node` is `^22.22.2 || ^24.15.0 || >=26.0.0`. It is the range of the dependency `@osdlc/typed-git` (from its dependency `hosted-git-info`), and a package never declares a wider range than a dependency's. The range is unchanged.
