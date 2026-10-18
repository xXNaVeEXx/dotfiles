---
name: macos-storage-audit
description: macOS-Festplattenplatz analysieren und belegbar machen — df/du-Kreuzcheck, TCC-gesperrte Ordner via Finder-AppleScript messen, Snapshots/Papierkorb/purgeable prüfen, lange Scans als Hintergrundlauf. Use when der User Speicherplatz auf dem Mac auditieren, aufgeräumten Platz verifizieren oder „warum ist die Platte voll"-Fragen klären will.
---

# macos-storage-audit

---
name: macos-storage-audit
description: macOS-Festplattenplatz analysieren und belegbar machen — df/du-Kreuzcheck, TCC-gesperrte Ordner via Finder-AppleScript messen, Snapshots/Papierkorb/purgeable prüfen, lange Scans als Hintergrundlauf. Use when der User Speicherplatz auf dem Mac auditieren, aufgeräumten Platz verifizieren oder „warum ist die Platte voll"-Fragen klären will.
---

# macOS-Storage-Audit (Platzanalyse & Belegungsbeweis)

Klasse: Festplattenbelegung auf macOS transparent machen — welche Ordner/Dateien halten den Platz, welche Quellen zeigen es, und wie man eine vom User angezweifelte Belegung beweist.

## Procedure

1. **Schnellbild (Sekunden):**
   - `df -h / /System/Volumes/Data` — `/` allein zeigt nur das Systemvolume (sealed, ~12 G); die Daten liegen im Data-Volume.
   - `diskutil info disk4s5 | grep -iE "free space|purgeable|container"` — Container-Free ist die Wahrheit; Finder zeigt „verfügbar" oft inkl. purgeable (iCloud-/Cache-Daten) und weicht scheinbar von df ab — das ist keine Analyse-Unstimmigkeit.
   - `tmutil listlocalsnapshots /` (komplett zählen, nicht nur tail) und `tmutil destinationinfo` (ist überhaupt ein Backup-Ziel konfiguriert?).
2. **Belegung messen:**
   - `du -sh ~/* 2>&1 | grep -v "Operation not permitted" | sort -rh` — stderr NIE komplett wegwerfen: TCC-gesperrte Ordner (Documents, Downloads, Desktop, ~/.Trash) schweigen sonst still. Gesperrte Ordner separat listen.
   - TCC-Ordner-Größen über den Finder erfragen (Finder hat Full-Disk-Access, `du` nicht):
     `osascript -e 'tell application "Finder" to get size of folder (POSIX file "/Users/<u>/<ordner>" as alias)'` bzw. `… get size of trash'` — Ergebnis-Bytes per awk in GB.
   - Brocken-Dateien gezielt statt Voll-Subfolder-du: `find <ordner> -maxdepth 3 -type f -size +1G -exec du -h {} \; | sort -rh | head` — liefert Pfad + Größe als unbestreitbare Einzel-Evidenz.
3. **Lange Scans backgrounden:** `du` über ein volles Home mit vielen kleinen Dateien sprengt bash-Timeouts (60 s, 300 s) regelmäßig → als `bg_run` (timeout ~1200 s, isAgent:false) starten und die Wartezeit mit User-Dialog nutzen; Ergebnis bei der Notification auswerten. Nie timeout-Kaskade mit immer größeren bash-Timeouts probieren.
4. **Belegungsbeweis bei Zweifel („ich habe doch gelöscht"):**
   - Kreuzcheck zweier Ebenen: df (belegte Blöcke) gegen die Summe aus du (existierende Dateien) + System + purgeable/Snapshots rechnen. du zählt nur vorhandene Dateien — gelöschte Dateien können du nicht erhöhen. Ohne den Hauptfresser muss die Restsumme zu df passen; tut sie es nicht, existieren die Dateien.
   - Papierkorb via Finder messen (TCC!), Snapshots als Restdifferenz erklären. Ergebnis als Tabellen-/Kreuzrechnung präsentieren, plus die größten Einzeldateien mit vollem Pfad.
5. **System-Snapshots richtig deuten:** `com.apple.os.update-*` und `MSUPrepareUpdate`-Snapshots sind macOS-Update-Reste bzw. ein VORBEREREITETES Update — kein User-Müll, aber relevant vor OS-Wechsel-/Partitions-Aktionen (macOS vorher aktualisieren und neu starten).

## Pitfalls
- `2>/dev/null` bei du verschluckt die TCC-Verweigerung komplett — die Ordner tauchen dann als „0" auf und die Analyse sieht falsch aus. Immer mit stderr filtern und Sperrung melden.
- df auf `/` zeigt das falsche Volume (System, nicht Data) — Belegungsfragen immer gegen `/System/Volumes/Data` beantworten.
- Finder/osascript-Größen sind Byte-Zahlen (awk nach GB konvertieren) und leicht veraltet (Metadatenindex) — für Plausibilität gut, für den Beweis die du/find-Einzelpfade nutzen.
