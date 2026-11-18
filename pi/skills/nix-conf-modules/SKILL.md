---
name: nix-conf-modules
description: "Features in das nix-conf-Flake einbauen (Option + mkIf-Modul + Host-Flag) und sicher verifizieren: git-add-Falle bei neuen Dateien, activationPackage-Build statt interaktivem rebuild.sh. Use when editing the nix-conf repo, adding home-manager or NixOS modules/flags, verifying flake changes without switching, when ssh asks for a password although ssh-copy-id reports the key as installed, or when a home-manager-managed setting vanished from a machine although the fix is committed."
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
6. Aktivieren: `./rebuild.sh` — niemals `home-manager`/`nixos-rebuild`/`darwin-rebuild` direkt (rebuild.sh wählt Attribut + sudo korrekt). Nur von einem Stand aktivieren, der main enthält (`git merge-base --is-ancestor origin/main HEAD`): ein Switch ersetzt die GANZE Generation, ein Zweig hinter main nimmt deshalb still jeden dort fehlenden Fix wieder von der Maschine. Zweig erst rebasen, dann switchen. Bei sauberem Baum läuft `./rebuild.sh switch </dev/null` ohne Rückfrage durch.

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
- `programs.ssh.extraConfig` wird von HM mit Assertion abgelehnt („Cannot set extraConfig if settings.\"*\" is not declared") — globalen `Host *`-Block stattdessen als `programs.ssh.settings."*".<option>` schreiben; HM rendert ihn als letzten Block, konkrete matchBlocks bleiben prioritaer.
- Diagnose-Muster SSH-Passwort trotz installiertem Key (ssh-copy-id: „All keys were skipped … already exist", Login fragt trotzdem nach Passwort): der Client BIETET den Key nie an — kein Standard-Dateiname, kein Agent, kein Host-Block. Vor dem Fix prüfen: `ssh -G <host> | grep -i identityfile`. Dauerlösung fleetweit über `myHome.identity.privateSshKey` + settings."*".identityFile (nicht pro Host), wirkt je Maschine erst nach deren rebuild. Ursache der Schere: `ssh-copy-id` nimmt die neueste `~/.ssh/id*.pub`, `ssh` bietet ohne Config nur Standardnamen an — bei zwei `id_*`-Schlüsseln landen so verschiedene Keys auf Server und im Angebot. Gegenprobe ohne Serveränderung: `ssh -o BatchMode=yes -o IdentitiesOnly=yes -i <key> <host> true`.
- Live-Datei weicht vom Repo ab (eine HM-verwaltete Einstellung „ist wieder weg", obwohl der Fix committet ist): Live-Datei gegen `nix eval --raw '.#homeConfigurations."$USER@$HOSTNAME".config.home.file."<pfad>".text'` halten und die Generationen unter `~/.local/state/nix/profiles/home-manager-*-link/home-files/<pfad>` durchsehen — hatte eine ältere Generation die Einstellung, die aktuelle nicht, wurde von einem Stand hinter main gewechselt (Schritt 6). Vor dem erneuten Switch mit `diff -rq <aktuelle-generation>/home-files <neues activationPackage>/home-files` und `nix store diff-closures` belegen, dass sich nur das Erwartete ändert.
- Root-symlinks `configuration.nix`/`hardware-configuration.nix` im Repo-Root nicht durch echte Dateien ersetzen (autoUpgrade-Pfad über /etc/nixos).
