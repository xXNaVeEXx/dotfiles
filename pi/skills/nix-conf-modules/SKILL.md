---
name: nix-conf-modules
description: Features in das nix-conf-Flake einbauen (Option + mkIf-Modul + Host-Flag) und sicher verifizieren: git-add-Falle bei neuen Dateien, activationPackage-Build statt interaktivem rebuild.sh. Use when editing the nix-conf repo, adding home-manager or NixOS modules/flags, or verifying flake changes without switching.
---

# nix-conf-modules

# nix-conf: Features & Module hinzufügen/ändern

Gilt für ~/projects/nix-conf (Multi-Host-Flake: NixOS `nixosConfigurations.<host>`, darwin `darwinConfigurations.<host>`, standalone HM `homeConfigurations."user@host"`). Architektur-Details stehen in CLAUDE.md des Repos — dieser Skill deckt Prozedur + Verifikation + Stolperfallen ab, die dort fehlen.

## Prozedur: Feature einbauen (Home-Manager-Ebene)

1. Option deklarieren in `home/options.nix` unter dem passenden Namespace (z.B. `myHome.apps.<feature = lib.mkEnableOption "...";`).
2. Modul schreiben in `home/modules/<feature>.nix`, ALWAYS `config = lib.mkIf config.myHome.<area>.<feature> { ... };` — nie unkonditionale Config in einem Feature-Modul, das bricht das Multi-Host-Modell. Für Programme bevorzuge native HM-Module (`programs.gh`, `programs.fzf`, …) statt roher `home.packages`, wenn es Settings/Integration gibt.
3. Registrieren in `home/modules/default.nix` (Import-Liste) — sonst erreicht das Modul keinen Host.
4. Aktivieren im Host-File (`home/<host>.nix`) oder Profil (`home/profiles/<bundle>.nix`), Flag setzen. Aktuellen Host via `hostname` bestimmen; Attribut in flake.nix ist `$USER@$HOSTNAME` (HM) bzw. bare hostname (NixOS/darwin).
5. Verifikation VOR jedem `switch` (siehe unten).
6. Aktivieren: `./rebuild.sh` — niemals `home-manager`/`nixos-rebuild`/`darwin-rebuild` direkt (rebuild.sh wählt Attribut + sudo korrekt).

Analog System-Ebene: Option in `options.nix`, Modul in `modules/**/*.nix`, Flag in `hosts/<host>/configuration.nix`.

## Verifikation ohne Switch

Reihenfolge zwingend:

1. **`git add` neuer Dateien VOR dem Nix-Build.** Nix filtert den Git-Tree; ungetrackte `.nix`-Dateien sind für den Flake unsichtbar → Fehler `Path '...' is not tracked by Git`. `git add` reicht, kein Commit nötig.
2. Build ohne Aktivierung: `nix build .#homeConfigurations."$USER@$HOSTNAME".activationPackage --no-link` (NixOS: `.#nixosConfigurations.<host>.config.system.build.toplevel`).
3. Options-Wert prüfen: `nix eval .#homeConfigurations."$USER@$HOSTNAME".config.<option.path>` — bestätigt, dass Flag + mkIf greifen.
4. Erst dann `./rebuild.sh` (vom Nutzer oder interaktiv) laufen lassen.

## Stolperfallen

- `./rebuild.sh switch|test|boot|full` fragt bei dirty git tree interaktiv nach → blockiert in nicht-interaktiven Tool-Calls. Entweder vorher committen oder den Befehl dem Nutzer übergeben und nur die Build-Verifikation selbst machen.
- Eval-Warnings (stateVersion-abhängige neovim ruby/python-Defaults, `programs.ssh.matchBlocks` deprecated, `stdenv.isLinux` deprecated) sind pre-existing Noise aus alten Modulen — nicht durch die eigene Änderung verursacht, nicht "reparieren", solange der Task sie nicht betrifft.
- Nie `osConfig.mySystem.*` direkt aus einem Home-Modul lesen (bricht standalone-HM) — Bridge über `myHome.*` bzw. `home/profiles/from-os-config.nix`.
- Root-symlinks `configuration.nix`/`hardware-configuration.nix` im Repo-Root nicht durch echte Dateien ersetzen (autoUpgrade-Pfad über /etc/nixos).
