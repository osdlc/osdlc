# Agent work identity

At the start of each pass, record one identity for the work the pass performs.
Use it unchanged in every review, comment, response, marker, and final report
from that pass.

| Field | Value |
|---|---|
| Actor | The authenticated GitHub login from `gh api user --jq .login` |
| Agent | The harness running the pass (`Codex` or `Claude`) |
| Model | The exact model id the agent runs as, read from its own system prompt (for example `claude-opus-4-1`), never a family name such as `opus`; `unknown` only when it is not exposed |
| Effort | The reported reasoning effort, or `unknown` |
| Host | `hostname` |
| Session | `<host>:<harness>-<6 random chars>` (for example `mbp:claude-k3x9qa`), generated once at the start of the pass and reused unchanged. Use `<host>:<pid>` instead only when the harness itself exposes its process id; never a shell's `$$` or `$PPID` |
| Skill | `<skill-name>@<plugin-version>` from the host's plugin manifest; `<skill-name>@dev` when there is no manifest (a development tree); `<skill-name>@unknown` only when a manifest exists but has no version |
| Started | `date -u +%Y-%m-%dT%H:%M:%SZ` at the start of the pass |

Do not guess a value the harness does not expose. Write `unknown` instead; the random session
suffix above is the one value you generate yourself. Values placed in an HTML marker must contain no
spaces; use `unknown` when a value cannot be represented that way.

## Comment signature

Append this short, visible signature to every inline finding posted by
`/skill:craft-review-pr` and every response posted by `/skill:craft-check-pr`:

```markdown
<sub>🤖 <agent> · <model> · <skill></sub>
```

Follow it with this hidden, machine-readable record:

```html
<!-- pr-tools: actor=<actor> agent=<agent> model=<model> effort=<effort> session=<session> skill=<skill> at=<started> -->
```

`/skill:craft-check-pr` keeps its existing `<!-- check-pr: re=<comment-databaseId> -->`
marker on top-level responses. Add the `pr-tools` record as a separate marker;
the reply marker remains the source of truth for duplicate detection.

## Remote for the state script

`review-state.mjs` writes to a git remote. Decide once per PR whether it belongs to the repository
the checkout's `origin` points at: normalise `origin`'s URL to `owner/repo` and compare it,
case-insensitively, with the PR's `owner/repo`.

```sh
git remote get-url origin | sed -E 's#^(git@|ssh://([^@/]+@)?|https?://([^@/]+@)?)github\.com[:/]##; s#(\.git)?/?$##'
```

It handles `git@github.com:o/r.git`, `https://github.com/o/r(.git)`, `ssh://git@github.com/o/r` and
URLs carrying `user[:token]@`. When they match, omit `--remote`. For a PR in any other repository,
add `--remote https://github.com/<owner>/<repo>.git` to every call; it takes a URL as well as a
remote name, and works from a directory that is not a git repository. A GitHub Enterprise or other
non-`github.com` host does not normalise: always pass an explicit `--remote <url>` there.

Pass a PR's commit as the full 40-character sha everywhere a sha is recorded (`fixed in <sha>`,
`--fixed-in`, `--head`, `--base`).
