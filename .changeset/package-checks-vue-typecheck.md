---
'@osdlc/package-checks': minor
---

`package-checks ts` accepts a library with Vue single-file components. When a package has a `.vue` file under `src/`, its `typecheck` script must be `vue-tsc --noEmit && vue-tsc -p tsconfig.build.json --noEmit`, because `tsc` cannot read a `.vue` file and would pass without checking the components. Every other package keeps `tsc --noEmit && tsc -p tsconfig.build.json --noEmit`. `shapeTs.TYPECHECK_VUE` holds the new script, and `shapeTs.scriptProblems` picks between the two from the file list it is given.
