---
name: desktop-app-release
description: Use when packaging or releasing a cross-platform desktop app (Tauri v2 + GitHub Actions) for Linux, Windows and macOS: cheap pre-checks, test runs without a tag, tag-triggered draft releases, sidecars and bundled runtimes, reading failed bundle jobs, and handing the right installer to the user for testing.
---

# desktop-app-release

# Desktop-App für Linux, Windows und macOS paketieren und veröffentlichen

Klasse: Installer einer plattformübergreifenden Desktop-App in der CI bauen, prüfen und als Release ausliefern.
Stack beim Nutzer: Tauri v2 + GitHub Actions (Standard-Runner), Release-Workflow per Tag, Release als Entwurf.
Fallen von Tauri (Konfiguration, Sidecars, Linux, Windows, macOS, CI-Plattenplatz, Updater) stehen in
references/tauri-v2.md.

## Procedure
1. **Billig vorprüfen, nicht voll bündeln:**
   - Staging-Skripte (Sidecars, mitgelieferte Laufzeiten, Ressourcen) mit Fake-Werkzeugen im PATH testen.
   - Den Workflow mit actionlint prüfen.
   - Volle Bundle-Builds laufen nur in der CI. Sie dauern pro Plattform über 30 Minuten und brauchen viel RAM.
2. **Testlauf ohne Tag:**
   - Dem Release-Workflow zusätzlich `workflow_dispatch` mit einer Eingabe für die Plattformen geben.
   - Ohne Tag lädt er die Pakete als Workflow-Artefakte hoch und legt keinen Release-Entwurf an.
   - Stand auf einen `ci/<name>`-Zweig pushen, den Lauf per REST starten, den Zweig danach löschen.
   - `workflow_dispatch` startet nur Workflows, deren Datei schon auf dem Standard-Branch liegt. Einen NEUEN Workflow
     vor dem Merge testen: im Wegwerf-Commit zusätzlich `push: branches: [ci/<name>]` eintragen, auf diesen Zweig
     pushen, Lauf beobachten, Zweig löschen.
   - Erst taggen, wenn alle Plattformen grün sind. Grund: Jeder Tag-Lauf hinterlässt einen Release-Entwurf und
     kostet eine halbe Stunde.
3. **Beobachten:**
   - Den Lauf als Hintergrundtask verfolgen.
   - Die Matrix läuft mit `fail-fast: false`, damit eine rote Plattform die anderen nicht abbricht.
4. **Fehler gezielt lesen:**
   - `GET actions/runs/<run>/jobs` liefert je Job die Schritte; gesucht sind die mit `conclusion == "failure"`.
   - `GET actions/jobs/<job>/logs` (Weiterleitung folgen: `curl -L`) in eine Datei unter `.tmp/` schreiben.
   - Die Datei nur mit `grep -n -i 'error\|panicked\|failed to'` lesen.
   - Meldet ein Unterwerkzeug nur einen Sammelfehler, zuerst mit `--verbose` bauen. Bei Fehlschlag zusätzlich das
     Bundle-Verzeichnis als Artefakt hochladen (`if: failure()`). Grund: Raten kostet je Versuch einen ganzen Lauf.
5. **Taggen:**
   - Den Tag nach dem Muster des Workflows setzen; das Release entsteht als Entwurf.
   - Updater-Manifest und Signaturen gibt es nur mit den Signatur-Secrets. Fehlende Secrets und die
     Apple-Signierung als „wartet auf Nutzer“ führen.
6. **Übergabe an den Nutzer:**
   - Genau das Paket für sein System nennen, mit Link:
     - Arch/CachyOS → AppImage
     - Debian/Ubuntu → .deb
     - Windows → Installer (.msi/.exe)
     - macOS → .dmg
   - Bei privatem Repo dazusagen, dass der Download einen Login braucht.
   - Was nur von Hand prüfbar ist (Audio, Benachrichtigungen, Autostart, Updater), als Handtest-Liste mitgeben.

## Pitfalls
- Mitgelieferte Laufzeiten (z. B. Node) aus offiziellen Upstream-Builds nehmen, nie aus Nix. Grund: Nix-Binaries
  hängen an /nix/store-Pfaden (Interpreter, Bibliotheken) und haben andere Build-Optionen.
- Mitgelieferte `node_modules` vor dem Bündeln auf die Zielplattform beschneiden: Prebuilds anderer OS/CPU und
  musl-Varianten auf glibc-Linux entfernen. Grund: Paketierer wie linuxdeploy prüfen jede mitgelieferte ELF-Datei
  und brechen an fremden Binaries ab (Details in references/tauri-v2.md).
- Staging- und Hilfsskripte müssen `$CARGO_TARGET_DIR` beachten. Grund: CI und Entwicklungsrechner nutzen
  verschiedene Target-Verzeichnisse; ein fest verdrahtetes `target/` findet die Binaries nicht.
