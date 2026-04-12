"""Branch discovery helpers for PRD operations."""

from __future__ import annotations

from pathlib import Path

from darkfactory.utils.git._run import git_run
from darkfactory.utils.git._types import GitErr, Ok

__all__ = [
    "find_local_branches",
    "find_remote_branches",
]


def find_local_branches(prd_id: str, repo_root: Path) -> list[str]:
    """Return local branches matching ``prd/{prd_id}-*``.

    Strips the leading marker that ``git branch`` emits: ``* `` for the
    current branch, ``+ `` for a branch checked out in a linked worktree.
    Returns an empty list when none match.
    """
    match git_run("branch", "--list", f"prd/{prd_id}-*", cwd=repo_root):
        case Ok(stdout=output):
            return [
                _strip_branch_marker(line.strip())
                for line in output.splitlines()
                if line.strip()
            ]
        case GitErr():
            return []


def _strip_branch_marker(name: str) -> str:
    """Remove the ``* `` or ``+ `` prefix from ``git branch`` output."""
    for prefix in ("* ", "+ "):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def find_remote_branches(prd_id: str, repo_root: Path) -> list[str]:
    """Return remote tracking refs matching ``origin/prd/{prd_id}-*``.

    Each entry is the full remote ref as reported by ``git branch -r``
    (e.g. ``origin/prd/PRD-42-add-retry-logic``).
    Returns an empty list when none match or on git failure.
    """
    match git_run("branch", "-r", "--list", f"origin/prd/{prd_id}-*", cwd=repo_root):
        case Ok(stdout=output):
            return [line.strip() for line in output.splitlines() if line.strip()]
        case GitErr():
            return []
