---
id: D-04
type: decision
state: accepted
created: 2026-11-05
---

# D-04: Prompts fail instead of guessing, and reach the terminal only when asked

## Decision

- **A prompt can require a person.** `required: true` on `askYesNo`,
  `askText` and `askChoice` makes the prompt throw `NotInteractiveError`
  instead of answering without one: reason `no-terminal` before the question
  is written, when the input descriptor is not a terminal (or the question
  would go to stderr and stderr is not one), and `end-of-input` when input
  ends before a line is read. An empty line is still an answer and still gives
  the default. `requireInteractive()` throws the same `no-terminal` error from
  `openTty()`'s `null`, so a run that will need an answer can fail before its
  work starts.
- **Both forms the issue offered exist.** The option checks the descriptor a
  prompt actually reads and catches end of input, which only a prompt can see.
  `requireInteractive` checks once, up front, and hands back the terminal. A
  tool needs the second to fail before doing half a job and the first to stop
  Ctrl-D picking the default.
- **The error carries its exit code.** `NotInteractiveError.exit` is 2 for
  `no-terminal` and 1 for `end-of-input`. `runMain` and a command tree's `run`
  print the message and exit with it; under `--json` the error document's
  `code` is `not-interactive`. The message names the flag that answers
  instead, when the caller passes `flag`.
- **Reading `/dev/tty` is opt-in.** `openTty()` returns stdin and stderr when
  both are terminals, else opens `/dev/tty` read-write, else returns `null`.
  The prompts keep reading fd 0 by default. A caller passes the terminal's
  `fd` and `write` to them. There is no `tty: 'dev-tty'` prompt option.
- **`askChoice` takes a number or the text.** A number in range picks by
  position. Otherwise the exact text, then the text in another case when only
  one choice matches. Anything else, and an empty line with no default, says
  what to type and asks again when the input is a terminal. When it is not,
  it throws a plain `Error` naming the answer and the choices: nobody reads
  the re-ask, `yes | tool` would loop forever, and each re-read would eat a
  line meant for the next question. It is not `NotInteractiveError`: that
  error means nobody could answer, and with `required` set a pipe never gets
  this far (it fails `no-terminal` first). Here the caller let input that is
  not a terminal answer, and the input gave something that is not a choice,
  which is a bad answer (exit 1, code `error`), not a missing person.
  End of input gives the default, and with no
  default throws `end-of-input` even when not required: there is nothing to
  return. An empty list, a choice listed twice, or a default that is not a
  choice throws a plain `Error` before anything is written.
- **Data is printed safe, the question as given.** Choices, a default and an
  answer echoed back have terminal controls removed and stay on one line: a
  line feed or tab shows as `\n` or `\t`, so a choice cannot add a fake
  entry to the numbered list. The question is the
  tool's own text and may carry its own styling.
- **The new exports are experimental.** `askYesNo`, `canPrompt`, `readLine`
  and `isYes` stay stable; the new prompts, the terminal helpers, the error
  and the `required` and `flag` options are experimental until a tool has
  used them.

## Why

- The CLI standard says: no prompt unless stdin and stderr are both
  terminals, and a command that would ask takes a flag instead and without it
  fails with exit 2, naming the flag. Before this, `askYesNo` read whatever
  fd 0 held, so `yes | tool` or a stray here-doc answered for a person, and
  end of input quietly took the default. Each tool had to remember
  `canPrompt()` and build its own error. `pr-update` throws a bare `Error`,
  which exits 1, not 2.
- Exit 2 for `no-terminal` is the standard's rule: the command line must
  change (pass the flag). `end-of-input` is 1 because a person was asked, on a
  terminal, and closed the input. Nothing about the command line was wrong.
- `/dev/tty` is opt-in because the standard's rule exists so a script can
  drive a tool through stdin. Reading the terminal behind a script's back
  would hang a script run from an interactive shell. It is right only for a
  command whose stdin is data, which only the command knows. Without a
  controlling terminal (CI, cron, a detached process) `/dev/tty` does not
  open, so automation still gets `null` and the no-terminal path.
- A terminal object with `fd` and `write`, not an option on each prompt,
  because the prompts already take `fd` and `write`, and one terminal is
  opened once and used for several questions, then closed by its owner.
- Numbers first in `askChoice` because the list shows numbers. Text is
  accepted too, since typing `json` is natural. An ambiguous text match asks
  again rather than guess.

## Consequences

- The question goes to `/dev/tty` too when the device is used, so
  `tool 2>log` still shows it to the person.
- `askText` has no validation hook and `askChoice` no labels distinct from
  values. A tool that needs either loops over `askText` or maps the choice it
  gets back. Either can be added later without breaking these.
- Windows has no `/dev/tty`. `openTty` returns `null` there unless stdin and
  stderr are terminals.
