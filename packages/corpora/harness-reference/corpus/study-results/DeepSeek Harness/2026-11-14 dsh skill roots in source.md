---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L257-L265 at 39163dd"
excerpt:
  exact: "{ path: join(projectRoot, '.dsh/skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK, projectRoot }, { path: join(projectRoot, '.agents/skills'), source: 'project-agents', rank: PROJECT_AGENTS_RANK, projectRoot }, ) } roots.push(...this.customSkillDirs.map(path => ({ path, source: 'custom' as const, rank: CUSTOM_RANK }))) if (this.includeDefaultRoots) { roots.push( { path: join(this.dshHome, 'skills'), source: 'user-dsh', rank: USER_DSH_RANK, skipSystem: true }, { path: join(this.agentsHome, 'skills'), source: 'user-agents', rank: USER_AGENTS_RANK },"
  prefix: "leSystem(this.ctx)) roots.push( "
  suffix: " ) } if (this.bundledSkillDir !="
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> { path: join(projectRoot, '.dsh/skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK, projectRoot }, { path: join(projectRoot, '.agents/skills'), source: 'project-agents', rank: PROJECT_AGENTS_RANK, projectRoot }, ) } roots.push(...this.customSkillDirs.map(path => ({ path, source: 'custom' as const, rank: CUSTOM_RANK }))) if (this.includeDefaultRoots) { roots.push( { path: join(this.dshHome, 'skills'), source: 'user-dsh', rank: USER_DSH_RANK, skipSystem: true }, { path: join(this.agentsHome, 'skills'), source: 'user-agents', rank: USER_AGENTS_RANK },
