Environment: Pi 1.3.0 coding agent; default provider zai-coding-cn (glm-5.3). Extensions laden via jiti aus ~/.pi/agent/extensions/*.ts; 'typebox'-Imports werden vom Pi-Loader aliased.
§
Self-improvement stack lives in hermes-mind: extension ~/.pi/agent/extensions/hermes-mind.ts; memory files ~/.pi/agent/hermes-mind/MEMORY.md + USER.md (this file, §-separated entries, frozen snapshot per session); skill_manage tool over ~/.pi/agent/skills; session_search (FTS5, ~/.pi/agent/hermes-mind/sessions.db); autonomous review turns arrive as custom message 'hermes-review' every N user turns / tool iterations.
§
Hermes design lessons: 'nudges' are post-turn background review passes, not injected text; the memory snapshot is frozen at session start to protect the provider prefix cache; skills must be class-level umbrellas (SKILL.md + references/ depth), never session artifacts; task-learnings belong in skills, only every-session facts belong in memory.
§
Pi-Lifecycle: Sessions resumable (pi --continue/--resume <id>); jede Session spawnt eigenen billion-context-Proxy als Kind (Port 1878x); "native-attach: skip"-Meldungen = INFO; Home bleibt absichtlich repo-frei (User-Entscheidung).
§
Extension error-hub (~/.pi/agent/extensions/error-hub.ts): F/W/I-Ringpuffer (30) als Widget „⚠ error-hub · alt+e" + Overlay (alt+e //errors); Details/Lektionen: Skill pi-extension-dev.
§
Artefakt-Extension (~/.pi/agent/extensions/artifacts/, selbstgebaut): Auto-Diff-Artefakte + 💬-Notes, Viewer /artifact N mit Typ-Renderern. Wartung: Skill pi-artifacts-viewer; Paketübersicht via Skill pi-pkg-report.
§
bigpowers-Patch: omp-hooks.ts:162 stdio:["ignore","pipe","ignore"] setzen, sonst git-stderr-Echo im TUI; nach npm-Update neu setzen (Skill pi-extension-dev §8).
§
Pi-Verteilung: nix-conf myHome.pi (Flake earendil-works/pi/stable; pi-sync-Timer; dotfiles pi/-Subtree: settings/skills/extensions, ohne node_modules/hermes-mind; auth.json nicht gesynct → 1× /login je Machine). Maschinen: macOS-MBP, maga (Arch), omarchy (Asahi-MBP, ssh root@192.168.178.91, sudo-PW 1234), cachydeck = Steuer-Host mit hermes-mind-MASTER (sessions.db lebt NUR dort — Memory/DB-Migrationen von dort ziehen).
