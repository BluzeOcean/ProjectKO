---
name: skills
label: the project skills, and how to use them
description: The project skills, where they live, how to read one, and what a skill does not promise.
---

# Skills

Project KO's skills are folders of instructions. Each one has a `SKILL.md` with
frontmatter (`name`, `description`) and a body.

- `.agents/skills/<name>/SKILL.md` — the maintained source, shared with Codex.
- `.claude/skills/<name>/SKILL.md` — the complete Claude Code copy.

The two copies are kept identical by `npm run skills:sync`; edit the `.agents` copy and
sync. A template check fails when they differ.

## Using one

1. Read the `description` to decide whether the skill covers your task.
2. Read the whole `SKILL.md` before you start — it carries the workflow, the formats and
   the checks that skill expects.
3. Follow the skill, and quote its exact path when you hand the work to someone else.

The skills that cover the work you are most likely to do:

| Skill | Covers |
| --- | --- |
| `workspace-authoring` | boards, tabs, cards, report tabs, Markdown deliverables |
| `character-sheet-pipeline` | a character reference sheet, then a 3D-ready image |
| `img2threejs` | image → 3D mesh, with quality gates |
| `fal-ai-generation` | image and video generation through fal.ai |
| `higgsfield-workflow` | the Higgsfield CLI for real-time generation |
| `image-reference-workflow` | editing an accepted reference without re-styling it |
| `game-level-design`, `game-ui-workflow`, `game-animation-integration`, `game-audio-workflow`, `game-vfx-workflow` | the game production workflows |
| `gameplay-visual-review` | checking a gameplay change in the running game |
| `blender-game-animation` | animation for a game character in Blender |
| `motion-reference-workflow`, `character-sheet-pipeline`, `materials-to-game`, `3d-production-routing` | the rest of the 3D pipeline |
| `video-watch` | sampling a video and reporting what is in it |
| `feature-handoff` | writing a handoff another agent can act on |
| `plan` | turning a broad request into a small plan |

## What a skill does not promise

**A skill is instructions, not a connection.** Its presence does not mean that a
connector, an account, an API key or a running Unity, Blender or Unreal instance is
there. Verify the thing itself before you promise a result — read the state, run the
command, or ask the owner. A skill that names a tool the machine does not have is a
plan, not a result.
