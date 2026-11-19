---
methodType: probe
harnesses:
  - "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  - "[Cursor](../../harnesses/Cursor.md)"
  - "[Pi](../../harnesses/Pi.md)"
  - "[Claude Code](../../harnesses/Claude%20Code.md)"
subjects:
  - "[Relative paths in SKILL.md](../../subjects/skills/Relative%20paths%20in%20SKILL.md.md)"
  - "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
  - "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
  - "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
commands:
  codex:
    - codex --version
    - codex plugin marketplace add ./fixture
    - codex plugin add layout-probe@probe-market
    - '(cd fixture/project/app && codex exec --sandbox workspace-write --json "Use the paths skill and follow it.")'
    - codex plugin remove layout-probe@probe-market
    - codex plugin marketplace remove probe-market
  cursor:
    - cursor-agent --version
    - '(cd fixture/project/app && cursor-agent -p --trust --force --output-format stream-json --plugin-dir ../../plugin "Use the paths skill and follow it.")'
  pi:
    - pi --version
    - '(cd fixture/project/app && pi -p --mode json --skill ../../plugin/skills/paths "Use the paths skill and follow it.")'
  claude-code:
    - claude --version
    - '(cd fixture/project/app && claude -p "Use the paths-root skill and follow it." --output-format stream-json --verbose --allowedTools "Bash,Read" --plugin-dir ../../plugin)'
    - '(cd fixture/project/app && claude -p "Use the paths skill and follow it." --output-format stream-json --verbose --allowedTools "Bash,Read" --plugin-dir ../../plugin)'
record:
  - The harness version and the model, from the JSON output.
  - Whether the skill was found, and the name it ran under.
  - "For each of the four cases, the first attempt (the exact path read or command line run, and the working directory) and the outcome code: `resolved`, `verbatim-failed`, `decoy-project`, `decoy-plugin-root` or `other`."
  - For each case, any later attempt and the marker it reached, if the first attempt missed.
  - "The `argv0` and `pwd` lines the scripts print."
  - The absolute path the agent reports for SKILL.md, reduced to its shape (for example a cache folder or the `--plugin-dir` folder), never a full home path.
  - Whether the harness told the model the skill's folder, if the JSON output shows it.
  - Whether the scripts kept their exec bit, from whether the run could execute them.
safety:
  - "`codex plugin marketplace add` and `codex plugin add` write to the user's Codex config and plugin cache. The last two Codex commands remove both."
  - "`--force` lets Cursor run shell commands without asking, and `--trust` trusts the working folder for the run."
  - "`--allowedTools \"Bash,Read\"` lets Claude Code run shell commands without asking."
  - "The only commands the skills ask for are the fixture's scripts. Each prints four lines and changes nothing."
  - Every run uses the account the CLI is signed in to, and counts against its usage.
---

# plugin-layout

On Codex, Cursor and Pi a skill has no plugin-root variable, so a skill names its files by paths
relative to its SKILL.md. The model reads SKILL.md and must turn such a path into one that works
before it acts. The main risk is that the model pastes a command as written, so the shell runs it
from the project folder and the path points at the wrong place. This probe checks whether the model
resolves the path. It answers
[osdlc/skillwright#148](https://github.com/osdlc/skillwright/issues/148) and the open statement
`Codex CLI Relative paths in SKILL.md open`.

## Fixture

`fixture/plugin/` is one plugin, `layout-probe`, written by hand so the run does not depend on
`skillwright build`. It has a manifest for Claude Code, Cursor and Codex, and two skills:

- `paths` writes every path relative to its SKILL.md, as a skill must on Codex, Cursor and Pi.
- `paths-root` writes every path from `${CLAUDE_PLUGIN_ROOT}`. It is the Claude Code control.

`paths` covers four cases:

| Case | Text in SKILL.md | Right file | Its marker |
| --- | --- | --- | --- |
| 1. Reference, skill-local | `[guide](references/guide.md)` | `plugin/skills/paths/references/guide.md` | `PATHS-GUIDE-SKILL-OK` |
| 2. Reference, plugin-shared | `[style](../../references/style.md)` | `plugin/references/style.md` | `PATHS-STYLE-PLUGIN-OK` |
| 3. Script, skill-local | Run `scripts/check.sh` | `plugin/skills/paths/scripts/check.sh` | `PATHS-CHECK-SKILL-OK` |
| 4. Script, plugin-shared | Run `../../scripts/tool.sh --check` | `plugin/scripts/tool.sh` | `PATHS-TOOL-PLUGIN-OK` |

`paths-root` reads and runs the same plugin-shared files, and its own skill-local copies, which
print `PATHS-ROOT-GUIDE-SKILL-OK` and `PATHS-ROOT-CHECK-SKILL-OK`.

Every run starts in `fixture/project/app/`, the project folder. Decoys sit where each path lands
when it is read from the wrong folder:

| Wrong folder | Case | Decoy file | Its marker |
| --- | --- | --- | --- |
| Project folder | 1 | `project/app/references/guide.md` | `PATHS-GUIDE-DECOY-PROJECT` |
| Project folder | 2 | `references/style.md` (two folders up) | `PATHS-STYLE-DECOY-FIXTURE` |
| Project folder | 3 | `project/app/scripts/check.sh` | `PATHS-CHECK-DECOY-PROJECT` |
| Project folder | 4 | `scripts/tool.sh` (two folders up) | `PATHS-TOOL-DECOY-FIXTURE` |
| Plugin root | 1 | `plugin/references/guide.md` | `PATHS-GUIDE-DECOY-PLUGIN-ROOT` |
| Plugin root | 3 | `plugin/scripts/check.sh` | `PATHS-CHECK-DECOY-PLUGIN-ROOT` |

From the plugin root, cases 2 and 4 point outside the plugin, where no file exists. Each script
prints its marker, `argv0`, its arguments and its working directory.

The skill text does not say which folder its paths are relative to. It asks the model to list every
attempt, so a first attempt that missed is still on record when the model recovers.

## Running it

Run the commands from this folder. Each harness loads the plugin its own way:

- **Codex** has no session-only plugin load. The run adds `fixture/` as a local marketplace
  (`fixture/.agents/plugins/marketplace.json`), installs the plugin into the plugin cache, runs, and
  removes both. The installed copy lives in the cache, so the right files are there, not in
  `fixture/plugin/`.
- **Cursor** loads `fixture/plugin/` for the session with `--plugin-dir`.
- **Pi** loads the skill folder for the session with `--skill`. The plugin-shared files sit two
  folders up from it, as in a package.
- **Claude Code** loads `fixture/plugin/` with `--plugin-dir` and runs both skills: `paths-root` is
  the control, and `paths` shows how Claude Code handles the relative form.

To pin a model, add the harness's model flag to the run command, and record it.

## Outcome codes

- `resolved`: the first attempt reached the right file and its marker.
- `verbatim-failed`: the first attempt used the path as written from a folder where no file sits at
  that path, such as the plugin root for cases 2 and 4, and found nothing. A path used as written
  from the project folder reaches a decoy, so it is `decoy-project`.
- `decoy-project`: the first attempt reached a project-folder decoy.
- `decoy-plugin-root`: the first attempt reached a plugin-root decoy.
- `other`: anything else, such as a skipped step or a search. Say what happened.

## Results

Each run is also a study result of kind `run`, in `study-results/<harness>/`, with this method in
`specifiedBy` and the JSON output in its body. A statement then cites it. Fill one row per run.

| Harness | Version | Model | Date | Skill | Case 1 | Case 2 | Case 3 | Case 4 | Study result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codex CLI | | | | `paths` | | | | | |
| Cursor | | | | `paths` | | | | | |
| Pi | | | | `paths` | | | | | |
| Claude Code | | | | `paths-root` | | | | | |
| Claude Code | | | | `paths` | | | | | |
