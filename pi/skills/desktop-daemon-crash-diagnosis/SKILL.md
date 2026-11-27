---
name: desktop-daemon-crash-diagnosis
description: "Tiefendiagnose abgestürzter User-Session-Daemons (GLib/GNOME-Dienste wie Dateiindexer localsearch/tracker, Miner, Portals, systemd --user-Units) über die Coredump-Triage hinaus — Absturzzeile (Bail out!/assert) aus dem Journal lesen, Quellcode der installierten Version beschaffen (GNOME-Tarball, GitLab-Tree-API), gdb im Batch-Modus mit Debuginfod symbolisieren (Prompt-Falle), Fehler-Domain/Code-Kette bis zum Assert zurückverfolgen, Dienstzustand in dessen SQLite-/Tracker-Index read-only prüfen, Upstream-Fixstand ermitteln und Optionen statt ungefragter Fixes anbieten. Use when a user-session daemon crashed with SIGABRT/SIGTRAP, the journal shows `Bail out!` or `ERROR:file:line:func`, the same service crashed repeatedly (Restart-Zähler, coredump-Serie), or the cause must be pinned to a source line plus upstream state."
---

Desktop-Daemon-Crash-Diagnose (User-Session-Dienste) — Ergänzt Omarchys `diagnose-crash`-Skill (unter `/usr/share/omarchy/default/agents/skills/diagnose-crash/`, nur lesbar, nicht patchbar) um die Tiefe für GLib/GNOME-Daemons, die sich selbst abbrechen (SIGABRT über `g_error`/`g_assert`), und um die read-only-Prüfung ihres Zustands (systemd-Unit, SQLite-/Tracker-Index).

## 0. Rahmen
- Diagnose liest nur: kein `gsettings set`, kein `systemctl restart`, kein `rm` an Daten. Fixes werden am Ende als nummerierte Optionen angeboten, der Nutzer wählt.
- Omarchy-Bug nur, wenn die Ursache in Omarchys Sphäre liegt (Paket-Patch, Omarchy-Config). Ein App-Upstream-Bug ist keiner — dann Upstream-Stand ermitteln, aber nur mit explizitem Nutzer-JA melden.

## 1. Journal der abgestürzten PID isolieren
- `journalctl --user _PID=<pid>` (in Datei speichern: `> /tmp/crash-<pid>.log`). Filter über `_COMM` oder `-o json-verbose` lieferten leer — Identifier-Filter `-t <name>` oder `_PID` funktionieren.
- GLib-Dienste loggen vor dem Abort `ERROR:../path/file.c:LINE:func: message` + `Bail out! …` (`g_error`) oder `… code should not be reached` (`g_assert_not_reached`). Das ist file:line:function der **installierten Version** — gdb ist dann überflüssig.
- Die eigentliche Ursache steht in den Zeilen **davor** (z. B. `Could not execute …: <innerer Fehler>`); Batch-Dumps können hunderte Zeilen sein → mit `grep -n` und Zeilennummern arbeiten, die Fehlerzeile zuletzt.
- Serie oder Einzelfall: `coredumpctl list <binary>` + `journalctl --user -t <identifier> --since -14d | grep -c "<Signatur>"`; die variierenden Teile (IDs, Pfade, old/new-Werte) extrahieren und auf Konstanz über Stunden prüfen — konstante Wertepaare = persistenter „Gift“-Zustand, nicht nur Race.

## 2. Update-Auslöser ausschließen
- `pacman -Qo /usr/lib/<bin>`, `pacman -Qi <pkg>` (Build-/Install-Datum, Reason), `grep -n "<pkg>\|<lib>" /var/log/pacman.log | tail` → Upgrade kurz vor dem ersten Absturz? Nein → kein Update-Auslöser, Bug war schon im Paket.

## 3. Quellcode der exakten Version beschaffen
- GNOME-Tarball ist der schnellste Weg: `https://download.gnome.org/sources/<pkg>/<major.minor>/<pkg>-<version>.tar.xz` (KB–MB, unter einer Minute), nach `/tmp/<dir>` entpacken.
- GitLab (gitlab.gnome.org) raw braucht exakten Ref + exakten Pfad; Pfade wandern zwischen Tags (`src/libtracker-sparql` → `src/libtinysparql`, `src/miners/fs` → `src/indexer`). Pfade vorher listen: `GET /api/v4/projects/GNOME%2F<pkg>/repository/tree?ref=<tag>&recursive=true&per_page=100` (seitenweise, ohne Auth). Blob-Suche braucht Auth (401) — nicht versuchen.
- Versionsstand: `GET …/repository/tags?per_page=5` → ist die installierte Version die neueste? Fix nur auf master → master-Version derselben Stelle holen und vergleichen.
- In der Quelle die **Fehlerbehandlungskette** zurückverfolgen: Wer setzt den Fehler (Domain/Code), wer übersetzt ihn (`g_propagate_prefixed_error` behält Domain/Code, `g_error_matches`-Ketten im Aufrufer), welche Codes behandelt der Aufrufer, welcher fällt durchs `g_assert_not_reached`? Genau diese Kette im Report als „bewiesen“ führen; was nicht in der Quelle steht, als „abgeleitet“ markieren.

## 4. gdb im Batch-Modus (nur wenn das Journal keine Quelle nennt)
- Core entpacken: `coredumpctl dump <pid> --output=$(mktemp -d)/core` (gerne > 200 MB), nach der Analyse `rm -rf` des Ordners.
- **Debuginfod-Falle:** `gdb -batch` beantwortet „Enable debuginfod for this session?“ ohne TTY mit **N** → „Debuginfod has been disabled“, Frames bleiben `?? ()`. Richtig: `DEBUGINFOD_URLS="https://debuginfod.archlinux.org" gdb -q -batch -iex 'set debuginfod enabled on' -ex 'bt' …` (verifiziert: „Debuginfod functionality is currently set to on“, lädt Debug-Info). `-ex` genügt nicht — es läuft erst nach der Frage.

## 5. Dienstzustand read-only prüfen
- `systemctl --user status <unit>` (NRestarts, MemoryCurrent), `systemctl --user cat <unit>` (Restart=-Policy, Slice), `systemctl --user show <unit> -p NRestarts -p MemoryCurrent`.
- Zustands-DBs immer read-only öffnen: `sqlite3 "file:<path>?mode=ro"`. Joins über Millionen Zeilen laufen in Sekunden; trotzdem erst Schema (`sqlite_master.sql`), dann zählen.
- IDs aus Fehlermeldungen („old: X, new: Y“) über die ID→URI-Tabelle auflösen (Tracker: `Resource(ID, Uri)`) — daraus wird die Geschichte rekonstruierbar (zwei URNs für denselben Pfad = Verzeichnis gelöscht und neu angelegt, neuer Inode).
- Konsistenz jetzt messen (Zähler je Zustand): alles gesund → der Zustand war transient (Zeitfenster, z. B. während eines Builds); noch kaputt → persistenter Giftzustand, Absturz kehrt sicher wieder.
- localsearch/tinysparql-Index: Pfade, Tabellennamen, Identitäten, bekannte Absturzursache und Fix-Optionen in `references/localsearch-index.md`.

## 6. Upstream-Stand und Report
- Upstream: Projekt-NEWS auf master (raw), Issue-Tracker der Distributionen (Debian `bugs.debian.org`, Fedora Bugzilla) nach **Funktionsname** durchsuchen, nicht nach Datum; neueste Tags beider betroffenen Projekte prüfen (Bibliothek + Anwendung).
- Report auf Deutsch, vier Punkte (wie Omarchy-Skill): was/wobei; Mechanismus **bewiesen vs. abgeleitet getrennt**; Nutzerdaten betroffen?; Wiederkehr/Fix. Serie mit Zahl der Abstürze nennen.
- Optionen am Ende anbieten, nie ausführen: `omarchy-crash-mute '<binary-path>'` (unterdrückt nur Meldungen), Ursache beseitigen (z. B. Index-Ausschlüsse per gsettings — ändert, was die Desktop-Suche findet → Nutzerentscheid), Upstream-Issue (nur mit JA).
- Aufräumen: `/tmp`-Arbeitsordner (Tarballs, Quellcode, Logs) löschen; entpackte Cores nie liegen lassen.
