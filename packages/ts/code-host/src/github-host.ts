/**
 * The one rule for "is this host GitHub", shared by host selection
 * (`codeHostNameForRemote`) and the GitHub auth checks' `remote` check, so
 * the two cannot disagree about a remote.
 */

/**
 * Whether `host`, a remote's parsed hostname, is GitHub's: `github.com` or a
 * subdomain of it (`ssh.github.com`), in any case. A lookalike such as
 * `notgithub.com` or `github.com.example.org` is not, and neither is a GitHub
 * Enterprise host such as `github.acme.com`; the `code_host.override` config
 * key covers those.
 */
export function isGithubHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'github.com' || h.endsWith('.github.com')
}
