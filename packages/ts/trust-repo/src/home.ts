/**
 * The home directory every default path in this package is built on.
 */

import { homedir, userInfo } from 'node:os'
import { isAbsolute } from 'node:path'

/**
 * The user's home directory, always absolute. `os.homedir()` returns `HOME`
 * (`USERPROFILE` on Windows) as given, so a relative value would put every
 * path built on it inside the folder the tool runs in, which can be the
 * repository being judged. A relative value is treated as unset, and the OS
 * account's home (`os.userInfo().homedir`) is used instead.
 * @experimental
 */
export function homeDir(): string {
  const fromEnv = homedir()
  if (isAbsolute(fromEnv)) return fromEnv
  try {
    const account = userInfo().homedir
    if (isAbsolute(account)) return account
  } catch {
    // No account entry. Fall through to the error below.
  }
  throw new Error(`no absolute home directory: HOME is '${fromEnv}' and the OS reports none`)
}
