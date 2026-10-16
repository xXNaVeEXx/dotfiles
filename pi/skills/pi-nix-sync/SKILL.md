---
name: pi-nix-sync
description: Verteile und pflege Pi auf allen Maschinen via nix-conf home-manager (myHome.pi, pi-sync-Timer) und dotfiles-Subtree pi/ — Rebuild-, Sync- und Git-Land-Prozedur inklusive Stolperfallen. Use when the user asks about pi installation on machines, pi-sync, dotfiles pi subtree, adding machines to the pi distribution, or debugging the sync timer.
---

# Pi-Verteilung über nix-conf + dotfiles

Architektur: nix-conf installiert Pi (Flake-Input `github:earendil-works/pi/stable`) via `myHome.pi.enable` auf allen Gamzat-Maschinen; `pi-sync` spiegelt den konfigurierbaren Slice von `~/.pi/agent` über den dotfiles-Klon `~/projects/dotfiles` (Subtree `pi/`) per Git.

## Beteiligte Stellen
- `~/projects/nix-conf/flake.nix`: Input `pi` (follows nixpkgs), wird via `extraSpecialArgs`/`specialArgs` an home-module durchgereicht (3 Stellen: mkHomeLinux, nixos, darwin).
- `~/projects/nix-conf/home/modules/pi.nix`: Paket + `pi-sync`-Skript + systemd-User-Timer (nur Linux, darwin nur Skript+Activation) + Bootstrap (Erst-Pull wenn `~/.pi/agent/skills` leer).
- `~/projects/nix-conf/home/options.nix`: `myHome.pi.enable` (mkEnableOption-Muster des Repos).
- Enables: `home/gamzat-cachyos.nix`, `gamzat-shared.nix`, `gamzat.nix` (nixos), `gamzat-darwin.nix`. maga/marv kriegen Pi NICHT.
- dotfiles-Repo `github:xXNaVeEXx/dotfiles`: Subtree `pi/` = AGENTS.md, settings.json, keybindings.json, skills/, extensions/ (OHNE node_modules — Symlink-Farm, regenerierbar), hermes-mind/{MEMORY.md,USER.md,config.json}.

## Sync-Umfang (was bewusst NICHT reingeht)
- auth.json: Provider-Tokens, bewusst pro Maschine → 1× `/login` je Machine (sops-Ausbau wäre später möglich, age-Key fehlt bisher auf Maschinen).
- Lokal/riesig/regenerierbar: npm/ (1012M, aus settings.json via `pi install`), install/, sessions/, backups/, ext-dev/, missions/, usage-history/, web-search-cache/, models-store.json, *.log, sessions.db*.

## Prozedur: Änderungen an der Verteilung
1. dotfiles: /tmp-Klon aktualisieren (`git pull`), pi/-Subtree ändern, Branch + Conventional-Commit, landen via `GIT_BIGPOWERS_LAND=1 bash <bigpowers>/scripts/land-branch.sh <branch> "<type>(scope): <subject>"` (guard-git/omp-hooks blocken Agent-Commits UND -Pushes direkt auf main — auch `git commit` alleine).
2. nix-conf: Modul/Option/Enables ändern, NEUE DATEIEN ZUERST `git add`en (Flake-Evaluation sieht nur getrackte Dateien — sonst „Path … is not tracked by Git"), dann Branch + land-branch.
   - land-branch-Requirements: Branch VOR dem Commit mit `git checkout -b <name>` anlegen (ein Commit direkt auf main lässt land-branch mit „Feature branch does not exist" abbrechen), Branch muss auf aktuellem origin/main basieren (sonst „not based on current main" → rebase), Commit-Subject ≤ 72 Zeichen (guard-git blockt sonst den Commit), Working Tree auf main muss clean sein → nicht-branch-Dateien vorher `git stash push -m … <dateien>`, nach dem Land `git stash pop`.
3. Rebuild je Machine: `cd ~/projects/nix-conf && home-manager switch --flake .#gamzat@cachydeck` (macbookpro: darwin-Rebuild; shared/gamzat-dev: `.#gamzat@shared`).
4. Verifikation: `which pi`, `pi-sync` einmal manuell, `systemctl --user list-timers pi-sync.timer` (darwin: `launchctl list | grep pi-sync`), Klon-Status `git -C ~/projects/dotfiles log --oneline -1`. Gedächtnis-Gleichstand über Maschinen per Hash beweisen, nicht annehmen: `md5sum` (Linux) bzw. `md5 -q` (macOS) über `~/.pi/agent/hermes-mind/{MEMORY.md,USER.md,config.json}` lokal und via SSH vergleichen.

## Stolperfallen
- Neue .nix-Datei untracked → Flake-Fehler beim switch: Datei VOR der Evaluation `git add`en.
- bg_run/bash mit Pipe (`| tail`) verschluckt den Exit-Code des eigentlichen Befehls (Pipe liefert tail-RC zurück) → Rebuilds ungepiped starten oder `PIPESTATUS` prüfen; einen „completed"-Exit-0 immer gegen die Log-Tail auf echte Fehler prüfen.
- Erstlauf von pi-sync klont nach `~/projects/dotfiles`; schlägt SSH fehl, exitiert er still (Timer retryt). /tmp/dotfiles ist NICHT der Sync-Klon.
- Rebuilds im Hintergrund (bg_run) in nix-conf: der Dirty-Tree-Prompt von `rebuild.sh` (`read -n 1`) exitet ohne TTY sofort mit RC 1, Log zeigt nur die Warnzeile → `printf 'y\n' | ./rebuild.sh …` voranstellen. Danach scheitert darwin `switch` an sudo ohne Passwort-TTY (tty_tickets verhindert Vorab-Caching) → im Hintergrund stattdessen sudo-frei `darwin-rebuild build --flake .#<host>` validieren und die Aktivierung dem User-interaktiven `./rebuild.sh switch` überlassen (Home-Manager-only-Ziele auf Linux brauchen kein sudo und laufen komplett im Hintergrund durch).
- pi-sync überschreibt lokale Divergenzen im Sync-Slice im Last-Pusher-Wins-Verfahren; Git-Historie im Klon bleibt Rückgrat.
- Timer-Service läuft ohne TTY/Agent: git push kann ohne SSH-Agent scheitern — toleriert, nächster Lauf retryt.
- ROLLBACK-INCIDENT (16.10.26): Der mtime-only-Guard las Pull-Echos als lokale Änderungen (Schritt 5 rsync -a setzt Live-mtimes auf Pull-Zeit) → Maschine mit altem Live-Stand pushte origin-ältere Inhalte über neuere Commits. Fix: cmp-Inhaltsvergleich im Push-Teil (fe429f4). Beim Manuell-Arbeiten im Klon: immer ERST Live reparieren, DANN Klon (sonst überschreibt der nächste Timer-Lauf den Klon-Stand mit dem alten Live-Stand).
- In nix writeShellScriptBin (''-Strings) ist `read -d ''` ein Syntaxbruch (`''` startet nix-Escape) → `'''` schreiben (5e3f7b6).
- Schlägt eine HM-Aktivierung nach „remove home-manager-path" fehl (z. B. File-Kollision wie manuelles `nix profile install gh` vs. gh-Modul), ist das home-manager-Binary selbst weg und `nix profile rollback` scheitert (Generation 0) → Rettung: `nix run nixpkgs#home-manager -- switch --flake .#<host>`. Darwin-Activation braucht ROOT: `sudo darwin-rebuild switch --flake .#macbookpro` (remote ohne Passwort nicht automatisierbar).
- Repo-Pfad ist maschinenabhängig (darwin: `~/nix-config`, andere: `~/projects/nix-conf`) — Pfad am Live-System verifizieren, nie blind aus diesem Skill übernehmen.
- Git-Push fragt nach Login und scheitert mit „authentication failed" → Repo hängt an HTTPS-Remote; GitHub nimmt Passwort-Auth nicht mehr an. Diagnose: `git remote -v` + SSH-Test `ssh -T git@github.com` (erwartet: „Hi <user>!"), Fix: `git remote set-url origin git@github.com:<user>/<repo>.git`. Bei mehreren Klonen pro Maschine jedes Repo einzeln prüfen.
- Die darwin-pi-sync-Derivation unterscheidet sich von der Linux-Version (LaunchAgent statt systemd-Teil) → ihr nix-store-Hash weicht vom Linux-Hash ab, das ist kein Fehler. Guard-Präsenz per `grep -c "cmp -s" "$(readlink -f "$(which pi-sync)")"` prüfen, nicht per Hash-Vergleich.
- Automatisierte stille Pulls (`pull -q`, Auto-Upgrade/Sync) können einen Rebase-State stranden lassen: `.git/rebase-merge` enthält NUR `autostash`, Status meldet „all conflicts fixed: run git rebase --continue", Haupt-Branch steht schon auf origin. Erst Verlustprüfung (`git diff <autostash-sha>^1 <autostash-sha>` für Stash-Inhalt, `git diff <replay-commit> main --stat` für echten Inhalt), dann `git rebase --quit` (rührt Working Tree nicht an, wandelt Autostash in normalen Stash-Eintrag) und den Stash nach Prüfung droppen — bei leerem Replay-Patch ist er wertlos.
