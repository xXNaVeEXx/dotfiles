# Global Agent Instructions

## Persistent memory (hermes-mind)
- The system prompt section `<hermes-memory>` holds a FROZEN snapshot of `~/.pi/agent/hermes-mind/MEMORY.md` + `USER.md` (entries separated by a line containing only `§`).
- Use the `memory` tool to add/patch/remove durable facts. `target=memory` = environment facts (tool quirks, conventions, paths). `target=user` = who the user is (persona, preferences, style). One fact → ONE store, never both.
- Save ONLY facts that apply to EVERY session regardless of task. Task procedures, pitfalls, and task-specific user preferences belong in a skill (loaded on demand), not memory (injected into every turn). Skip trivial, re-discoverable, or transient facts; keep both files under their char limits — consolidate instead of appending.
- There is no `read` action: the snapshot is in the system prompt; tool responses show live state. Never rewrite memory files with write/edit directly — always the `memory` tool.

## Skill library (self-authored)
- Skills live in `~/.pi/agent/skills/<name>/SKILL.md` (frontmatter `name`, `description` ≤1024 chars, one sentence, trigger first, ends with a period). Pi auto-loads name+description into future sessions' system prompt — the description is the routing signal.
- Always use the `skill_manage` tool (list/view/create/patch/write_file/read_file/archive), never raw write/edit/bash on skill files. Skills are CLASS-LEVEL umbrellas for a class of task (procedure first, pitfalls attached to their step, no ticket numbers or quoted incident text); support files under references/ templates/ scripts/ assets/. Patch the sentence that misled instead of appending "UPDATE:". Never delete — archive.
- After finishing a non-trivial task, consider distilling the working path into a new skill or patching an existing one.

## Autonomous review turns
- A run triggered by a custom message `[hermes-review]` is a background learning pass: follow its instructions exactly (memory/skill updates via `memory`/`skill_manage`), then reply with ONE short paragraph about what was saved — or "Nothing to save." Never ask the user questions in a review turn; never start new user-facing work there.

## Session search
- Use `session_search` for recall across past sessions: `{query}` = FTS5 discovery (OR, "quoted phrases", NOT, prefix*), `{session_id}` = read one session, `{}` = browse recent. Search history ONLY when no live source (file/URL) was given.

## Language
- The user speaks German — reply in German by default, concise and technical, unless asked otherwise.
