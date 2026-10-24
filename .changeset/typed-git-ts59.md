---
'@osdlc/typed-git': patch
---

Type-check on TypeScript 5.9. `Soft<C>` indexed `Triable<C>` with a key TS 5.x could not prove valid (TS2536 in the emitted `outcome.d.ts`), and `Git.soft` / `AsyncGit.soft` inferred `this` instead of the class (TS2322 in the shipped source). Both are fixed, and `typecheck:ts59` guards 5.9.
