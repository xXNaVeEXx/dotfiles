Environment: Pi coding agent; default provider zai-coding-cn. Extensions laden via jiti aus ~/.pi/agent/extensions/*.ts; 'typebox'-Imports werden vom Pi-Loader aliased.
§
Self-improvement stack lives in hermes-mind: extension ~/.pi/agent/extensions/hermes-mind.ts; MEMORY.md + USER.md in ~/.pi/agent/hermes-mind (§-getrennt, Snapshot je Session eingefroren); skill_manage über ~/.pi/agent/skills (patch nur SKILL.md, references/* nur per write_file als ganze Datei); session_search (FTS5, hermes-mind/sessions.db); Review-Turns = Custom-Message 'hermes-review'.
§
Hermes lessons: nudges = post-turn background reviews; memory snapshot frozen per session (prefix cache); skills = class-level umbrellas (SKILL.md + references/), task-learnings in skills, only every-session facts in memory.
§
Pi-Lifecycle: Sessions resumable (pi --continue/--resume <id>); jede Session spawnt eigenen billion-context-Proxy als Kind (Port 1878x); "native-attach: skip"-Meldungen = INFO; Home bleibt absichtlich repo-frei (User-Entscheidung).
§
Extension error-hub (~/.pi/agent/extensions/error-hub.ts): F/W/I-Ringpuffer (30) als Widget „⚠ error-hub · alt+e" + Overlay (alt+e //errors); Details/Lektionen: Skill pi-extension-dev.
§
Artefakt-Extension (~/.pi/agent/extensions/artifacts/, selbstgebaut): Auto-Diff-Artefakte + 💬-Notes, Viewer /artifact N mit Typ-Renderern. Wartung: Skill pi-artifacts-viewer; Paketübersicht via Skill pi-pkg-report.
§
bigpowers-Patch: extensions/omp-hooks.ts (Zeile wandert je Version, aktuell :357) stdio:["ignore","pipe","ignore"] setzen, sonst git-stderr-Echo im TUI; nach bigpowers-Update neu setzen (Skill pi-extension-dev §8).
§
Pi-Verteilung: nix-conf myHome.pi (Flake earendil-works/pi/stable; pi-sync-Timer; dotfiles pi/-Subtree: settings/skills/extensions, ohne node_modules/hermes-mind; auth.json nicht gesynct → 1× /login je Machine). Maschinen: omarchy (Asahi-MBP = „der Mac“, läuft Linux) ist die aktuelle Hardware — nix-conf-Eintrag macbookpro (macOS/nix-darwin) ist VERALTET (bb5f19f); maga (Arch), cachydeck = Steuer-Host mit hermes-mind-MASTER (sessions.db NUR dort), gamzat-dev, nixos (Klon root-owned in /etc/nixos).
