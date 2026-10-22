/**
 * `@osdlc/code-host` — the CodeHost port (what a code host must answer about
 * pull requests) and its GitHub and Forgejo adapters. Git-unaware beyond
 * `@osdlc/typed-git`'s remote parsing and local drift counts; every shell-out
 * goes through the injected `CommandRunner` (`@osdlc/command-seam`).
 */

export * from './types.ts'
export * from './failure.ts'
export * from './github.ts'
export * from './github-auth.ts'
export * from './forgejo.ts'
export * from './forgejo-auth.ts'
export * from './facts.ts'
export * from './select.ts'
export * from './config.ts'
export * from './pr-ref.ts'
