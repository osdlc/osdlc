import { Git } from '@osdlc/typed-git'
import { IDENTITY } from '@osdlc/typed-git/testing'

/** Run git in `cwd` with the fixture identity; a failing command throws. */
export function sh(cwd: string, args: string[]): string {
  return new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()
}

/** Like {@link sh} with the arguments the other way round, and a failing command yields ''. */
export function git(args: string[], cwd: string): string {
  const result = new Git(cwd, { env: { ...IDENTITY } }).raw(args)
  return result.exitCode === 0 ? result.stdout.trim() : ''
}
