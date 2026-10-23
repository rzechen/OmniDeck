---
name: skill-creator
description: Create or update OmniDeck skills, or install existing skills from a URL or local folder. Use when asked to create, edit, explain, or install a skill. Not a callable tool.
description_zh: "创建或更新 OmniDeck 技能，或从 URL / 本地目录安装现有技能。用户要求创建、编辑、解释或安装技能时使用。不是可调用工具。"
---

# Skill Creator

Create or update skills in OmniDeck's global skills directory, or install existing skills from a URL or local folder. A skill is a directory of instructions for the agent — not a tool, not an API. Do not call a tool named `skill-creator`. This file is already the procedure.

If the user asks to install, install. Do not only print the destination path.

## Decide first

Pick one path from the current user message. Do not ask questions whose answers are already present.

| Situation | Action |
|-----------|--------|
| User is authoring instructions for how the agent should behave across sessions | Create |
| User explicitly asks to update or edit an existing skill | Update — resolve the exact target, then read its `SKILL.md` |
| User only asks what a skill looks like / how the format works | Explain — do not create a directory |
| User explicitly asks to install or add an existing skill from a GitHub/marketplace URL, package name, or local skill folder | **Install** — finish only when the files exist in the skills directory |
| Task is generic model knowledge or a one-off with no reusable procedure | Refuse — say why, do not create or install |

Ask only for missing pieces (name, purpose, trigger phrases, install source). One short question, then proceed.

## Location

OmniDeck has a single user-level global skills root — `<agentDir>/skills/`:

```text
<agentDir>/skills/<skill-folder>/
├── SKILL.md           # required
├── scripts/           # optional — deterministic or repeatedly rewritten code
├── references/        # optional — long docs loaded on demand
└── assets/            # optional — templates, images, boilerplate
```

`<agentDir>` is the agent directory announced in the system prompt (also available as the `PI_CODING_AGENT_DIR` environment variable in bash). Resolve it before writing; never guess a home-directory path. All skills are user-level and available across workspaces — there is no per-project skill scope.

A skill directory containing a `.builtin` marker file is a system built-in: read-only, shown with a「系统」tag in the app. Never modify, overwrite, or delete it. If the user wants changes to a built-in, create a custom copy under a new name instead.

The user can also manage skills in the app UI（资源市场 → 我的 → 我的技能：ZIP 导入 / 编辑 / 删除）. When the UI flow is simpler for the user, guide them there instead of hand-writing files.

Rules:

- `name` in frontmatter must equal the directory name `<skill-folder>`.
- If the target directory already exists, update it only when the user explicitly requested an update. Replace or overwrite it only after explicit user confirmation. Otherwise, stop and report the existing path. Do not create a second copy under another name.
- Do not vendor a downloaded third-party skill into a workspace; skills live only in the global skills root.

## Frontmatter

`SKILL.md` starts with YAML frontmatter, then markdown body. No other required files.
The authoring rules in this section apply to Create and Update. For Install, require only parseable frontmatter with a valid `name` and a present `description`; preserve other loadable forms unchanged.

```yaml
---
name: kebab-case-name
description: What the skill does and when to use it. Include trigger words and do-not cases.
---
```

`name`:

- Lowercase `a-z`, digits `0-9`, hyphens and single underscores only; kebab-case preferred
- 1–64 characters, no consecutive `--`, must start and end with a letter or digit
- Must match the parent directory name
- Do not quote it

`description` (this is the only trigger text the skill router sees):

- One line, plain YAML scalar — no `"..."` or `'...'`
- Must include what it does and when to invoke it
- Put trigger phrases here, not in the body
- Use the user's language unless they ask otherwise
- Target under 200 characters when possible; never pad with MUST/MANDATORY
- Do not use `: ` (colon-space) — it forces quoting. Reword with em dash or "including"
- Do not use `<` or `>`
- Prefer this shape: `Does X. Use when the user asks for Y or Z. Do not use for W.`

Optional: `env-keys: KEY1, KEY2` declares credential environment variables the skill needs; values are entered in the app's credential manager（我的资料 → 我的凭据）and injected when the skill activates.

## Body

Write imperative instructions. Only include what the model does not already know.
These are Create and Update authoring guidelines. Do not use them to rewrite an existing third-party skill during Install.

- Keep `SKILL.md` well under 500 lines. Move long material to `references/` and link it from the body (one level deep, no nested references).
- Do not repeat the description. Body assumes the skill already triggered.
- Do not add `README.md`, `CHANGELOG.md`, or human-facing project files.
- Point to `scripts/` for commands that must be exact; point to `assets/` for files that should be copied rather than loaded into context.

## Create

1. Confirm the action is write. Normalize the skill name and confirm it is valid.
2. Resolve `<agentDir>` from `PI_CODING_AGENT_DIR` or the system prompt.
3. Build the destination path `<agentDir>/skills/<skill-folder>/`.
4. If the destination already exists, follow the existing-target rule above. Do not switch to Update without an explicit update request.
5. Create the directory and write `SKILL.md` with valid frontmatter and a short body.
6. Add `scripts/`, `references/`, or `assets/` only when the use case needs them.
7. Validate, then report the path and the final description.

Template:

```markdown
---
name: code-reviewer
description: Review code for bugs, regressions, and maintainability issues. Use when the user asks for a code review, review of a diff or PR, or feedback before merging. Do not use for writing code from scratch.
---

# Code Reviewer

Review the given code or diff. Report bugs, missing tests, and concrete fixes first. Skip style nits unless they hide a defect.
```

## Install

When the user asks to install, perform the install. Pointing at the path is not enough.

1. Resolve `<agentDir>/skills/` as the install root.
2. Resolve the source URL or local folder. If a package name does not identify a provider or marketplace, ask once instead of guessing.
3. Materialize the source into a staging directory `<agentDir>/.skill-staging/<skill-folder>/` (never stage directly under `skills/` — a staged directory containing `SKILL.md` would be picked up as a live skill):
   - Local folder — copy the directory that contains `SKILL.md`
   - GitHub/repo URL — download the skill folder by archive (`curl -L`) and extract only the skill directory, not the whole monorepo
4. Locate exactly one skill directory in staging. If none or more than one contains `SKILL.md`, stop and ask for a specific skill folder.
5. Read the staged `SKILL.md`, minimally validate that it can be loaded, and derive `<skill-folder>` from `name`.
6. Treat the staged source as immutable. Preserve every source file and path exactly; do not rewrite frontmatter, move resources, rename optional directories, or otherwise normalize a valid historical layout.
7. Set the final destination to `<agentDir>/skills/<skill-folder>/`. If it exists, overwrite only when the user explicitly requested it; otherwise stop and report the existing path.
8. Move the validated staged directory into the final destination. Clean up the staging directory afterwards.
9. Confirm `<destination>/SKILL.md` exists, then report the installed path. Do not say "installed" before the files are there.

## Update

1. Resolve the exact target from an explicit path or skill name first.
2. Read the target `SKILL.md` and any referenced files you will touch.
3. Patch only what changed — description, body section, or a resource file.
4. Keep `name` aligned with the directory unless the user is explicitly renaming; when renaming, rename the directory too.
5. Validate.

## Validate

Check all of the following before telling the user the skill is done. Apply the strict format checks to Create and Update; for Install, use only the minimum checks and preserve the source unchanged.

- Path is exactly `<agentDir>/skills/<skill-folder>/SKILL.md`
- Directory name equals `name`
- `SKILL.md` has parseable frontmatter and a non-empty body
- For Create or Update, `name` and `description` are unquoted and legal
- For Create or Update, `description` has no `: `, no `<`, no `>`, and includes both what and when
- For Create, default to only `name` and `description` unless the user requires additional frontmatter keys. For Update, preserve existing valid extra keys unless the user asks to remove them
- `scripts/`, `references/`, and `assets/` are conventional optional directories, not an allowlist. Preserve other valid directories and do not relocate existing resources without a task-specific reason
- For Install, require only a valid `name`, a present `description`, a non-empty body, and existing referenced files
- For Create or Update, execute each new or modified script once successfully via bash

For Create or Update validation failures, fix and re-check. For Install validation failures, stop and report the incompatibility; never repair or normalize the staged source. Do not re-read the whole file after a clean validation.

## Anti-patterns

- Creating a skill for knowledge the model already has
- Putting trigger words only in the body
- Calling this skill as a tool, or instructing the model to "invoke skill-creator first"
- Asking for name/purpose/source when the user already gave them
- Telling the user a path instead of installing when they asked to install
- Guessing home-directory paths instead of resolving `PI_CODING_AGENT_DIR`
- Modifying, overwriting, or deleting a skill that contains a `.builtin` marker
- Staging downloads directly under `skills/` where they become live skills
- Treating "install from the web" as "author a new skill"
- Rewriting frontmatter or reorganizing files while installing an existing third-party skill
- Claiming success before the files exist and pass validation
- Duplicating an existing skill instead of updating it
