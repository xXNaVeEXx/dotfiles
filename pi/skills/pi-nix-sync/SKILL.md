---
name: pi-nix-sync
description: Verteile und pflege Pi auf allen Maschinen via nix-conf home-manager (myHome.pi, pi-sync-Timer) und dotfiles-Subtree pi/ — Rebuild-, Sync- und Git-Land-Prozedur inklusive Stolperfallen. Use when the user asks about pi installation on machines, pi-sync, dotfiles pi subtree, adding machines to the pi distribution, or debugging the sync timer.
---

# pi-nix-sync

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
3. Rebuild je Machine: `cd ~/projects/nix-conf && home-manager switch --flake .#gamzat@cachydeck` (macbookpro: darwin-Rebuild; shared/gamzat-dev: `.#gamzat@shared`).
4. Verifikation: `which pi`, `pi-sync` einmal manuell, `systemctl --user list-timers pi-sync.timer`, Klon-Status `git -C ~/projects/dotfiles log --oneline -1`.

## Stolperfallen
- Neue .nix-Datei untracked → Flake-Fehler beim switch: Datei VOR der Evaluation `git add`en.
- bg_run/bash mit Pipe (`| tail`) verschluckt den Exit-Code des eigentlichen Befehls (Pipe liefert tail-RC zurück) → Rebuilds ungepiped starten oder `PIPESTATUS` prüfen; einen „completed"-Exit-0 immer gegen die Log-Tail auf echte Fehler prüfen.
- Erstlauf von pi-sync klont nach `~/projects/dotfiles`; schlägt SSH fehl, exitiert er still (Timer retryt). /tmp/dotfiles ist NICHT der Sync-Klon.
- Rebuilds im Hintergrund (bg_run) in nix-conf: der Dirty-Tree-Prompt von `rebuild.sh` (`read -n 1`) exitet ohne TTY sofort mit RC 1, Log zeigt nur die Warnzeile → `printf 'y\n' | ./rebuild.sh …` voranstellen. Danach scheitert darwin `switch` an sudo ohne Passwort-TTY (tty_tickets verhindert Vorab-Caching) → im Hintergrund stattdessen sudo-frei `darwin-rebuild build --flake .#<host>` validieren und die Aktivierung dem User-interaktiven `./rebuild.sh switch` überlassen (Home-Manager-only-Ziele auf Linux brauchen kein sudo und laufen komplett im Hintergrund durch).
- pi-sync überschreibt lokale Divergenzen im Sync-Slice im Last-Pusher-Wins-Verfahren; Git-Historie im Klon bleibt Rückgrat.
- Timer-Service läuft ohne TTY/Agent: git push kann ohne SSH-Agent scheitern — toleriert, nächster Lauf retryt.
