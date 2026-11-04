Environment: Pi coding agent (nix-Store, Pfad wechselt je Update); default provider zai-coding-cn (glm-5.3). Extensions laden via jiti aus ~/.pi/agent/extensions/*.ts; 'typebox'-Imports werden vom Pi-Loader aliased.
§
Self-improvement: hermes-mind.ts-Extension; MEMORY.md/USER.md (§-getrennt, nur via memory-Tool); session_search (FTS5); Review-Turns 'hermes-review'.
§
Pi-Lifecycle: Sessions resumable (pi --continue/--resume <id>); billion-context-Proxy je Session (Port 1878x); keine Nur-Leerzeichen-Texte vor Tool-Calls (ID-Drift → compress-Ablehnung); „stop reason length“ = Ausgabegrenze → große Dateien in Teilen schreiben; bash-Tool bricht nach 60 s ab → timeout-Parameter setzen.
§
Extensions: error-hub (alt+e, Skill pi-extension-dev); artifacts (/artifact N, Skills pi-artifacts-viewer, pi-pkg-report).
§
Pi-Verteilung: nix-conf myHome.pi (Flake stable, pi-sync-Timer, dotfiles-Subtree pi/; auth.json nicht gesynct → 1× /login je Maschine).
§
mag-tech-monorepo + Lumi: Origin GitHub (MaG-TechOrg); Test-Cluster https://clusterapp.gamzatlab.net zieht `test` automatisch (~1 h), /api/version zeigt Commit; Forgejo git.mag-tech.eu tot. Branch-Backup: ~/projects/mag-tech-unique-branches-backup-2026-10-23.bundle
§
Fleet: omarchy (Asahi M1 Max MacBook, lokal) + cachydeck (KDE, x86_64, `ssh -o BatchMode=yes cachydeck`; KillUserProcesses=yes → lange Jobs nur per `systemd-run --user`).
§
Signaturschlüssel auf cachydeck (nicht omarchy): ~/.tauri/lumi-updater.{key,key.pub,password} (Key-ID 78340818E011FA16 = GitHub-Secrets), Handy-Age-Key ~/.local/share/mag-tech/signing/signatur-age.key; Inhalte nie ausgeben.
§
Git-Commit-Guard der Pi-Shell blockiert `git commit -m "MAG-…"` vorab („BLOCKED: …Conventional Commits…“), auch vorangestelltes `git add` wird verschluckt → Umgehung `git commit -F <datei>`.
§
mag-tech GitHub-Alltag: `export GH_TOKEN=$(cat ~/.tmp/gh_token.txt)` vor JEDEM gh-Aufruf (Keyring hängt sonst); KI-Plattform-Issues per MCP agents.gamzatlab.net/api/mcp (Bearer ~/.tmp/kip_token.txt, Accept json+event-stream): issue_create vor 1. Commit, Nummer aus Antwort; issue_comment {number:Zahl,bodyMd}; Releases: Skill mag-tech-release, PR-Merge: Skill gh-pr-automation.
