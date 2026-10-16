Environment: Pi 1.2.0 coding agent; default provider zai-coding-cn (model glm-5.3). Extensions auto-load from ~/.pi/agent/extensions/*.ts via jiti; 'typebox' imports are aliased by Pi's loader.
§
Self-improvement stack lives in hermes-mind: extension ~/.pi/agent/extensions/hermes-mind.ts; memory files ~/.pi/agent/hermes-mind/MEMORY.md + USER.md (this file, §-separated entries, frozen snapshot per session); skill_manage tool over ~/.pi/agent/skills; session_search (FTS5, ~/.pi/agent/hermes-mind/sessions.db); autonomous review turns arrive as custom message 'hermes-review' every N user turns / tool iterations.
§
Hermes design lessons: 'nudges' are post-turn background review passes, not injected text; the memory snapshot is frozen at session start to protect the provider prefix cache; skills must be class-level umbrellas (SKILL.md + references/ depth), never session artifacts; task-learnings belong in skills, only every-session facts belong in memory.
§
Pi-Lifecycle: Sessions resumable (`pi --continue`/`--resume <id>`); jede Session spawnt eigenen billion-context-Proxy als Kind (Port 1878x). "native-attach: skip" + "attaching to running proxy" = INFO. Git-Meldung im Home = kosmetisch; Home bleibt absichtlich repo-frei (User-Entscheidung).
§
Extension error-hub (~/.pi/agent/extensions/error-hub.ts): F/W/I-Ringpuffer (30) als Widget „⚠ error-hub · alt+e" + Overlay (alt+e //errors); Details/Lektionen: Skill pi-extension-dev.
§
Artefakt-Extension (~/.pi/agent/extensions/artifacts/, selbstgebaut): Auto-Diff-Artefakte + 💬-Notes bei jeder Agent-Änderung, Viewer /artifact N mit Typ-Renderern (HTML/Bild/MD/JSON/CSV). Wartung/Konventionen siehe Skill pi-artifacts-viewer; Testmaterial ~/demo-repo + ~/artifact-demo. Pakete: 14 installiert inkl. pi-antigravity (Provider, braucht /login antigravity); Live-Stand via Skill pi-pkg-report.
§
bigpowers-Patch (16.10.26): omp-hooks.ts currentBranch() → stdio:["ignore","pipe","ignore"]; execSync leitet ohne stdio stderr an process.stderr → git-„Schwerwiegend"-Echo im TUI bei jedem bash-Toolcall außerhalb Repos. bigpowers-npm-Update überschreibt: Echo zurück = Patch omp-hooks.ts:162 neu setzen. Diagnose: Skill pi-extension-dev §8.
