# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release. Upgrade to it.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.

## Threat model

This package builds `gh` command lines and reads what `gh` prints. It can
edit, comment on and merge pull requests, so a wrong argument can change a
repository. Reports about arguments that reach `gh` in a form the caller did
not intend are in scope.

- **The package reads no token.** `gh` finds its own credentials: its
  keychain entry, or `GH_TOKEN` and `GITHUB_TOKEN` in the environment. The
  child process inherits the caller's environment.
- **No shell is involved.** The package starts `gh` directly and passes each
  value as one argument, so spaces and shell metacharacters in a title or a
  body are inert.
- **`gh` still parses its arguments.** A positional value that starts with `-`,
  such as a label name, can be read as a flag. Check untrusted input before you
  pass it.
- **Endpoint strings are built from your input.** `api(endpoint)` puts the
  value into a REST path. Pass endpoints you built, not text from a user.
  `issueCommentEdit(commentId)` accepts only digits and throws `RangeError`
  for anything else, so its id cannot change the path.
- **`gh` chooses the repository.** It reads the working directory's git
  remotes, or `GH_REPO`. A checkout whose `.git/config` points `origin` at
  another repository sends mutations there. `ownerRepo` only parses a URL you
  give it. It does not check where `gh` will act.
- **`raw` and `rawChecked` run any `gh` command.** They have no allow list.
- **`CommandFailed` carries the full argv.** Its message quotes the arguments,
  and PR titles, bodies and comments travel in argv. Do not log the message
  where those are private. `createReview` sends its payload on stdin instead.
- **`prMerge` needs the head sha.** GitHub refuses the merge when the PR head
  is no longer that sha, so a push made after review cannot ride in. Pass the
  sha you judged, not one read just before the call.
