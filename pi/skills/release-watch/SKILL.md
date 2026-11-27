---
name: release-watch
description: "Release-Watch auf omarchy pflegen und erweitern — Skript ~/.config/omarchy/bar/scripts/release-watch, CLI `releases`, Bar-Modul gamzat.releases: meldet neue Versionen von pi, seinen npm-Erweiterungen, Omarchy/Systempaketen und weiteren GitHub-Projekten und zeigt Release-Notes. Use when the release watcher shall be changed or extended (more sources via extra), its notifications or bar counter misbehave, `releases` or `release-watch` errors, release notes are missing or wrong, or the user asks how update notifications work on this machine."
---

# release-watch

# release-watch

# Release-Watch: Versions-Beobachtung mit Desktop-Meldung und Release-Notes

Der Nutzer will dauerhaft informiert werden, wenn neue Updates kommen, und die Release-Notes lesen.
Gebaut als reines Lokal-Setup auf omarchy (nicht via nix-conf; Rollout auf andere Maschinen erst anbieten).

## Bausteine

- Skript `~/.config/omarchy/bar/scripts/release-watch` (Python, nur stdlib; kein `.py` → Write-Hook lintet
  nicht, ruff selbst laufen lassen). Modi: `list` (Standard), `notes [id…]`, `open [id…]`, `check [--auto]
  [--no-notify]`, `bar`, `json`, `selftest`, `edit`; globally `--pause`, `--all`. `releases <name>` = `notes <name>`.
- CLI `~/.local/bin/releases` (exec Skript). Bar-Modul `gamzat.releases` in `~/.config/omarchy/shell.json`
  (Command-Modul, Eintrag-Muster und Auslöser-Logik: Skill `omarchy-bar-widgets`); Backup `shell.json.bak.release-watch`.
- Config (optional) `~/.config/omarchy/release-watch.json`, anlegen per `releases edit` (Key `_hilfe` erklärt):
  `notify`, `pi{enabled,repo}`, `extensions{enabled,exclude[],registry}`, `system{enabled,notify,repo}`,
  `extra[{id, repo, installed?, name?, tag?, tag_prefix?, url?, type?}]`. Abschnitte werden mit Defaults gemischt;
  unlesbar → gelbe Zeile in `list`, Standardwerte aktiv.
- Zustand `~/.local/state/release-watch/state.json` (schema 1: `first_run`, `last_check`, `system.pending_count`,
  `sources{id:{name,kind,pkg,installed,repo,url,names,latest,seen,since,updated_from,updated_at,error,stale,released_at}}`),
  dazu `lock` (flock) und `last-check.log`. Cache `~/.cache/release-watch/*.txt` (Datei-mtime = Zeitstempel).
- Intervalle: Prüfung alle 3 h (`CHECK_SECONDS`), Bar ruft `bar` alle 120 s, Startversuch höchstens alle 10 min
  (`RETRY_AFTER`); Bar zeigt `󰚰 !`, wenn die letzte Prüfung > 12 h alt ist (und Uptime > 1 h).

## Quellen und die „neueste Version“

- **pi**: Tags von `earendil-works/pi` per `git ls-remote --tags --refs`; installiert = realpath von `~/.nix-profile/bin/pi`
  (`-pi-<version>/bin/pi`). In nix-conf ist ein Commit gepinnt (Tag v1.6.1) — ein Update heißt dort Flake-Pin/Tag ändern, nicht npm.
- **Erweiterungen**: deps aus `~/.pi/agent/npm/package.json`, installiert aus `node_modules/<name>/package.json`,
  neueste via `registry.npmjs.org/<@scope%2Fname>/latest`; Repo aus repository.url. Monorepos (MattDevy/pi-extensions:
  `pi-simplify-v0.2.3`) → paketbenannte Tags bevorzugen. `ismailsaleekh/pi-background-tasks` hat keine GitHub-Releases → Notes leer.
- **Omarchy/System**: `checkupdates` (pacman-contrib, 30 min Cache) liefert Anzahl + Kandidat von `omarchy`;
  Repo ist `omacom/omarchy` (ehemals basecamp; kein CHANGELOG). Arch-ARM-Pakete hinken GitHub-Releases hinterher
  (installiert 4.0.x, GitHub 4.6.0) — „neueste“ ist der Repo-Kandidat, Notes kommen von GitHub.
- **extra**: `repo: "owner/repo"` + `installed: "1.2.3"` = normale Quelle (Zähler + Meldung bei neuerer Fassung);
  ohne `installed` = nur beobachtet (Block BEOBACHTET, kein Zähler, Meldung bei jeder neuen Veröffentlichung,
  Notes zeigen allein die neueste Fassung). `type` Standard `github-tags`, alternativ npm (`pkg`-Angabe prüfen).

## Auswertung (reine Funktion `evaluate`)

- `pending` = installiert vorhanden, neueste ≠ installiert, neueste ≥ installiert (Versionschlüssel: dev < alpha <
  beta < rc < final; Arch-Release-Suffix `-N` wird abgeschnitten).
- Erster Lauf einer Quelle = Grundlinie (`seen`), keine Meldung; Ereignisse: `new` (Quelle mit Installation hat
  eine andere Fassung als `seen` gesehen), `release` (nur beobachtete Quelle), `system` (Pakete 0 → N).
  Nach einem Update setzt `reconcile` (list/bar, ohne Netz) den Zähler sofort zurück und merkt sich
  `updated_from` für die Notes „was habe ich gerade installiert“.
- Meldung nicht zugestellt (`notify-send` Exit ≠ 0) → `seen` zurück auf den alten Wert, nächster Lauf meldet erneut.

## Release-Notes (`notes`)

GitHub-Releases-API (anonym, 60 Anfragen/h je IP, 6 h Cache; `gh` wird bewusst nicht genutzt), Bereich
`(installiert, neueste]`, älteste zuerst; fehlt der exakte Tag → nächsthöhere veröffentlichte Fassung mit Hinweis
„nächste veröffentlichte Fassung“. Rückfall: `CHANGELOG.md` vom Default-Branch, Abschnitt bis zur nächsten
gleich-/höheren Überschrift. Ausgabe im TTY mit Pager, in `foot` mit `--pause`.

## Verifizieren

1. `release-watch selftest` → „9 von 9 Prüfungen bestanden“.
2. `release-watch list --all`, `release-watch bar | python3 -m json.tool`, `release-watch check --auto`
   (→ „Übersprungen: letzte Prüfung …“, wenn nicht fällig).
3. Zustellungs-/Ereignispfade ohne den echten Zustand anzufassen: `HOME=/tmp/<test>` + Test-Config, Shim
   `notify-send` im PATH protokolliert argv (Fehlerpfad: `exit 1`), „neues Release“ = `seen` zurücksetzen;
   Hash der echten `state.json` vorher/nachher vergleichen. Die Shim-Tests erzeugen echte Popups auf dem Desktop —
   Quellen `TEST-…` nennen und es dem Nutzer sagen.
4. Bar-Widget: `grim /tmp/bar-full.png` → rechten oberen Rand croppen (Skill `omarchy-bar-widgets`).

## Fallen

- Auslöser ist das Bar-Modul (Shell-Umgebung hat `DBUS_SESSION_BUS_ADDRESS`), kein systemd-Timer — ohne laufende
  Bar keine Prüfung. Schreiben unter `~/.config/systemd/user/` verlangt der Guard eine Nutzerbestätigung.
- `evaluate` ändert den übergebenen Zustand an Ort und Stelle → alte Werte vorher kopieren.
- `bash -lc` im Bar-Modul: Shebang `#!/usr/bin/python3` und absolute Pfade halten den Start unabhängig vom PATH.
- `foot -e` schließt bei Programmende → `--pause` am Ende jedes Fensters.
