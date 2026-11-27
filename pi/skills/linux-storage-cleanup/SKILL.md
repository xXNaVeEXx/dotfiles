---
name: linux-storage-cleanup
description: "Festplattenplatz auf den Linux-Maschinen (omarchy/cachydeck) autonom auditierten und freiräumen — aktive Builds per /proc nachweisen, Rust-Target/Incremental-Caches altersgefiltert löschen, btrfs-Kompressions-Falle, Keep-Liste für unersetzliche Daten. Use when the user says disk space is full or wants storage cleaned up on a Linux machine."
---

# linux-storage-cleanup

# Linux-Speicherplatz-Aufräumen (omarchy/cachydeck)

Autonomes Disk-Cleanup auf den Linux-Maschinen der Fleet: nur nachweislich ungenutzte/regenerierbare Daten löschen, aktive Builds und Dev-Sessions unangetastet lassen.

## Ablauf
1. `df -h /` + `du -xh --max-depth=1 /home/gamzat` (du -x bleibt im FS). Bei großem Home (600 GB+) dauert das du Minuten → als bg_run mit Ausgabe in kleine Textdateien starten (`du -xh --max-depth=1 <pfad> 2>/dev/null | sort -rh | head -60 > /tmp/du-<name>.txt`; kleine Dateien in /tmp sind ok), NICHT per sleep/pollen warten, sondern parallel die billigen Beweise sammeln (Fleet-Übersicht aus Schritt 3, `docker system df`, `git worktree list`) und dem Nutzer nach der ersten Minute einen Zwischenstand mit df-Wert und Befunden geben. Beachte: btrfs mit `compress=zstd` → du-Summen LOGISCH, df zeigt real; Verhältnis hier ~60%. /tmp ist tmpfs = RAM, nicht Disk.
2. Hauptverdächtige: Rust-`target/`-Dirs (ein einziger debug-Build >100G logisch!), `~/.cache/*`, `~/.npm`, alte SDKs, Stale-Klons.
3. Aktivitäts-Check VOR jedem Löschen:
   - `ps aux | grep -E "cargo|rustc|..."`, cwd aller Prozesse: `for p in /proc/[0-9]*; do readlink $p/cwd; done` | grep <dir>
   - Fleet-Übersicht in einem Aufruf (welche Projektordner sind heiß, der Rest ist leerstehend): cwds aller Prozesse auf Projektoberordner aggregieren — `for p in /proc/[0-9]*; do readlink $p/cwd; done | grep '^/home/gamzat/projects/' | sed -E 's#^(/home/gamzat/projects/[^/]+).*#\1#' | sort | uniq -c | sort -rn`; offene Dateien genauso: `find /proc/[0-9]*/fd -lname '/home/gamzat/projects/*' -printf '%l\n' 2>/dev/null` (mit `timeout`). Leerstehend ≠ wegwerfbar: vorher Git-Stand prüfen (ungespeicherte/ungepushte Commits).
   - `grep -a -l "<dirname>" /proc/[0-9]*/cmdline /proc/[0-9]*/environ` — Transiente Treffer (PIDs schon weg) sind harmlos; lebende Prozesse = Finger weg.
   - `find <dir> -newermt "-48 hours"` leer → stale.
   - Git-Klons: `git status --porcelain` + `git stash list` — nur löschen wenn keine lokalen Änderungen mit Wert (re-clonable).
   - Größe eines Löschkandidaten VOR dem rm bemessen: `find <muster> -print0 | du -ch --files0-from=- | tail -1`.
4. Agent-Shell-Pitfall: Der bash der Agent-Session lädt keine Login-Shell-Env — `command -v pnpm flutter dart java` findet User-Tools nicht. Solche Schritte nur ausführen, wenn das Binary via nix-Profil-Pfad oder absolut auffindbar ist, sonst überspringen (kein Fehlschlag-Signal).

## Sichere Löschungen (bewährt; eine Runde räumte ~300G)
- Rust `target-b`/Neben-Target-Dirs: ganz löschen wenn stale.
- `target/debug/incremental`: nur Dirs älter 48h löschen (`find . -mindepth 1 -maxdepth 1 -type d ! -newermt "-48 hours" -exec rm -rf {} +`) — läuft sogar während aktivem Build sicher, die aktuelle Session ist <48h. Große rm als bg_run starten (dauert Minuten).
- Caches: `~/.thunderbird-import`, `~/.cache/{yay,tracker3,go-build,chromium,mise,omarchy-build,pnpm}`, `npm cache clean --force`, Trash, alte `konfig-*-pruefung`.
- Flutter/Dart: `.dart_tool` + `build` löschen, Quellen behalten. Alte SDK-Duplikate nur nach Referenz-Check (grep in fish/bash-Config + Projekten; `-l`-Treffer in generierten `*_export_environment.sh` einer stale Sandbox sind kein Nutzungsnachweis).
- Docker: `docker system df` zeigt RECLAIMABLE je Kategorie. Build-Cache (`docker builder prune -a`) ist immer regenerierbar; Images ohne laufenden Container nur, wenn sie aus einer Registry stammen (repull-bar) — lokal gebaute Tags nur nach Rückfrage. Laufende Container (E2E-Postgres/Keycloak/Mailpit) und deren Volumes nicht anfassen.
- Worktree-Fleet (`~/projects/<repo>.<zweig>`, `~/projects/mag-tech-wt/<kürzel>`): in leerstehenden Worktrees nur Build-Artefakte löschen — `node_modules`, `.next`, `dist`, `.turbo`, `test-results`, `playwright-report` — Quellen und Git-Stand bleiben; Kosten ist ein erneutes `pnpm install` bei Wiederbenutzung. Einen ganzen Worktree erst nach Merge-/Push-Check per `git worktree remove` entfernen.

## Home-Root-Aufräumungen (Unordnung im $HOME)
- Log-Flut direkt in `~/` (`<prefix>*.log/.out/.jsonl`) = Ausgaben von Orchestrierungs-Workern, deren cwd $HOME war. Älter als die aktuelle Build-Welle und referencing-frei → löschbar; beim Ordnen neuer Wellen Worker-Logs ins Projekt-`.tmp/` schreiben lassen statt nach `~/`.
- Verdächtige Ordner klassifizieren: SDK-Klone (Flutter-SDK-git, JDK mit Quellen) und Build-Cache-Arbeitsplätze (`target/`-Monster) sind die Großverbraucher; Ordner ohne `.git` sind Kopien → gegen das kanonische Repo (remote/GitHub) abgleichen, dann löschbar. GUI-Handtest-Stub-Homes (`~/lumi-test-home-*`) sind Artefakte.
- Persönliche Dokumente im Home (Anleitungs-MD/HTML) beim Aufräumen nach `~/Documents/` verschieben statt löschen; Geheimnis-/Dump-Dateien (sops/age-Keys, *.dump) NIEMALS autonom löschen — User-Entscheidung.
- Lösch-Stapel >1 GB als bg_run mit Abschlussmarker (`echo DONE; df -h /home`) starten; kleine Löschungen sofort.

## Keep-Liste (NIE autonom löschen)
- `~/projects/lumi`, `mag-tech-monorepo` = aktive Dev. (Frühere Keep-Einträge `~/lumi-remote/{repo,target,target-win}`, `flutter-lumi`, `lumi-mobile-remote` wurden nach Stilleitungs-Check gelöscht: kein Prozess/kein Git/im GitHub redundant — Bedingung „solange Builds laufen" war entfallen; bei wieder aufgenommenem lumi-mobile-Iphone-Bau SDK + Repo neu klonen.)
- `~/migration` (SSH-, SOPS-Keys, Docker-Volumes, DB-Dumps — unersetzlich; über Deletion entscheidet nur der User), `~/Downloads` (persönliche Dokumente/Medien).
- Docker-Volumes ohne Container (`docker volume ls -qf dangling=true`): können alte DB-/Supabase-Daten enthalten → nur User-Entscheidung, nie `docker volume prune` autonom.
- Nix-Store-GC + journalctl-Vacuum brauchen root ohne Passwort-Sudo → überspringen und erwähnen. Ebenso root-only: `btrfs subvolume list /` (als User „Operation not permitted“).
