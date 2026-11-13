---
type: Harness Probe
title: Symlinked skill folder
description: "Put a symlink to a skill folder in a project's skill folder, and check whether the harness finds and loads the skill through it."
tags: [skills]
subjects: [skills/discovery-walk]
harnesses: [cursor, pi]
commands:
  cursor:
    - "cursor-agent --version"
    - "mkdir -p fixture/work/.cursor/skills"
    - "ln -s ../../../symlink-probe fixture/work/.cursor/skills/symlink-probe"
    - '(cd fixture/work && cursor-agent -p --trust "list every skill you can use, by name, then use the symlink-probe skill")'
  pi:
    - "pi --version"
    - "mkdir -p fixture/work/.pi/skills"
    - "ln -s ../../../symlink-probe fixture/work/.pi/skills/symlink-probe"
    - '(cd fixture/work && pi -p "list every skill you can use, by name, then use the symlink-probe skill")'
record:
  - The harness version.
  - Whether the skill was listed, and the name it was listed under.
  - Whether the reply held the `SKILL-SYMLINK-PROBE-OK` marker.
  - Any warning the harness printed about the link.
safety:
  - "`--trust` trusts the working folder for the Cursor run."
  - "Both runs use the account the CLI is signed in to, and count against its usage."
  - "`fixture/work/` is created by the run and ignored by git."
---

# Symlinked skill folder

The fixture holds one skill, `symlink-probe`, outside any skill folder. A run links it into the
project skill folder of a scratch project (`fixture/work/`) and asks the harness to list and use
it. A run answers the open question in `facts/cursor/skills/discovery-walk.md` and
`facts/pi/skills/discovery-walk.md`.

`skillwright harness link` puts such links in the user skill folder (`~/.cursor/skills`,
`~/.pi/agent/skills`), and refuses Cursor and Pi until this is recorded. A probe command may not
name a home directory, so the user folder is not part of the run. To check it as well, repeat the
link step by hand in the user skill folder, run the same prompt, and remove the link afterwards.
