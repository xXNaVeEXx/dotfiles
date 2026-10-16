---
name: subagent-orchestration
description: Use when the user hands over a large multi-part build to run autonomously (overnight or while away) and wants me to only orchestrate sub-agent workers while staying reachable: task files, RAM-aware launching, resuming killed workers, per-package integration without touching the work tree, commit/push, CI watch and status reports.
---

# subagent-orchestration

# Große Builds mit Sub-Agent-Workern orchestrieren

Klasse: Mehrteilige Implementierung (viele Pakete) autonom abarbeiten, während ich nur orchestriere.

## Grundregeln (Vorgaben des Nutzers)
- Ich orchestriere nur: Worker recherchieren und implementieren; ich schreibe Aufgaben, starte, integriere, committe,
  pushe und berichte. Selbst eingreifen nur bei akutem RAM-Mangel oder bei kleinen Integrationsfixes.
- Eigene Turns kurz halten (lange Läufe als Hintergrundtask), damit der Nutzer mich jederzeit erreicht.
- Nichts darf abstürzen: Prozesse des Nutzers nie anfassen; vor jedem Start `free -m` und Swap prüfen (siehe ram-audit).
- Ohne Rückfragen weiterarbeiten, solange Arbeit offen ist; Entscheidungen in Queue/Plan festhalten.

## Procedure
1. **Queue** im Projekt-`.tmp/` führen: Reihenfolge, Status je Paket, Paare, die nicht parallel laufen dürfen
   (gleiche Dateien). Ein Paket, das Dateien eines laufenden oder gestageten Pakets braucht, erst nach dessen Commit starten.
2. **Aufgabendatei je Paket** = Kopf + gemeinsamer Schwanz:
   - Kopf: Warum (Nutzerwunsch sinngemäß), Befund mit Datei:Zeile („Zeilen neu prüfen“), Aufgabe in Teilen,
     Tests mit Paket-Präfix (`<pkg>_*`), „Nicht anfassen“ (Pfade paralleler/gestageter Pakete, Lockfile, fremde
     Bereiche; in geteilten Dateien nur Zeilen mit Marker `// <PKG>:`).
   - Schwanz: Prüfbefehle, Berichtsformat, Arbeitsweise.
   - Platzhalter mit Python `str.replace` ersetzen und prüfen, dass keiner übrig ist — sed bricht, sobald der Titel
     `/` oder `&` enthält.
3. **Startdatei** (Prompt bleibt kurz: „Lies <Startdatei> vollständig und führe sie aus“): HEAD, fremde uncommittete
   Pfade (nur lesen), nur eigene Pfade ändern, kein git, keine Hintergrundtasks, keine lokalen Builds; Builds/Tests dort,
   wo RAM ist (Remote-Maschine), immer nur ein eigener Lauf; RAM-schonend lesen (`grep -n`, dann `sed -n 'a,bp'`,
   Ausgaben mit `head`, Logs nur gefiltert); Status-Zeile spätestens alle 3 min (sonst greift der Idle-Watchdog);
   Abschlussbericht ≤ 80 Zeilen als letzte Antwort und als Datei unter docs/reports/.
4. **Starten**: `acp_delegate` (agent worker, festes Modell, thinkingLevel medium, timeoutMinutes ~180).
   Parallelität nach RAM: jeder Worker-pi lädt alle pi-Pakete des Nutzers (~0,6–0,9 GB); bei knappem RAM genau einer.
   Zwei Worker nur, wenn ihre Pfade disjunkt sind UND sich ihre Build-Läufe nicht blockieren. Grund: Zwei cargo-Läufe
   im selben Target-Verzeichnis warten auf dasselbe Build-Lock; der wartende Worker steht dann minutenlang und belegt
   RAM. Gute Paarung: ein Rust-Paket + ein Paket ohne Compiler-Lauf (CI, Skripte, Doku). In beiden Startdateien den
   anderen Worker mit seinen Pfaden als tabu nennen; feste Sätze wie „kein anderer Worker“ in der Vorlage ersetzen.
5. **Abbruch (exit 143)**: `.out`/`.activity` lesen. Vollständiger Bericht vorhanden → fertig. Sonst mit
   `resumeFrom: <runId>` fortsetzen (Verlauf und Teilarbeit bleiben) und im Task sagen, wo es weitergeht.
   Wird derselbe Worker wiederholt vom RAM-Wächter beendet: dem Nutzer die RAM-Fresser nennen und ihn bitten,
   sie zu schließen, statt endlos neu zu starten.
6. **Integrieren, ohne den Arbeitsbaum anzufassen** (andere Worker arbeiten darin):
   - Nur die Pfade des Pakets in den Index stagen; geteilte generierte Dateien aus den gestageten Quellen neu
     erzeugen; Lockfile nur, wenn sein Diff allein zu diesem Paket gehört.
   - `git write-tree` → genau diesen Baum als Snapshot auf der Remote-Maschine prüfen (eigenes Target-Verzeichnis) →
     `git commit-tree` aus dem geprüften Baum mit Prüfabsatz und „Offen:“-Liste, Betreff ≤ 72 Zeichen → pushen.
   - Offene Punkte aus dem Bericht in Queue/TODO übernehmen.
7. **CI**: Läufe per REST mit der VOLLEN Commit-SHA suchen (kurze SHA liefert nichts). Beobachtung als Hintergrundtask
   mit `surviveReload: true`. Grund: Ein Reload von pi (z. B. nach Änderungen an Erweiterungen) beendet sonst alle
   laufenden Hintergrundtasks. Temporäre ci/*-Branches danach löschen. Release-Pakete: Skill desktop-app-release.
8. **Statusbericht** (Sprache des Nutzers, knapp): fertig + gepusht (SHA, was es für ihn bedeutet), läuft gerade,
   Probleme mit Ursache, nächste Pakete, was ich von ihm brauche.
9. **Fortschritts-Checkliste für den Nutzer** (wenn er sehen will, was erledigt ist und was fehlt):
   - Einmal von einem Sub-Agent aus Plan, Commit-Log, Paketberichten und Queue erstellen lassen, mit festem Format:
     `- [x] … — <PKG> <sha>` nur mit Beleg; offene Zeilen mit genau EINEM Marker `<!-- pkg:<PKG> -->`;
     Zählertabelle; Anhang der erledigten Pakete. Alles, was nur im Gespräch steht, gebe ich ihm als Stand-Datei mit.
   - Vor dem Commit prüfen: Jede genannte SHA löst auf (`git cat-file -e <sha>^{commit}`), und keine Zeile hat zwei
     Marker. Dann als eigenen Docs-Commit mit `[skip ci]` pushen, damit keine CI-Minuten verbraucht werden.
   - Nach JEDEM Paket-Commit per Skript abhaken: Marker → `[x]` + SHA, Anhang, Zähler, Stand-Zeit. Die Erinnerung
     daran hänge ich ans Ende des Commit-Skripts, damit sie nicht vergessen wird. Was laut Bericht noch „Offen“ ist,
     öffne ich von Hand wieder. Neue Befunde und Wartepunkte des Nutzers trage ich sofort ein.
   - Dem Nutzer den Pfad im Repo, den Web-Link und das Artefakt nennen.

## Pitfalls
- Nie ein write und ein bash, das diese Datei liest, im selben parallelen Batch — die Reihenfolge ist nicht garantiert.
- „completed exit=0“ eines Hintergrundtasks heißt nicht grün: Wrapper-Skripte verschlucken Fehler; rc und
  Ergebniszeilen im Log lesen.
- Zeilennummern in Aufgaben veralten, sobald andere Pakete committet sind — Worker immer per grep neu bestimmen lassen.
- `bg_delegate`-Ergebnis mit `delivery: artifact`: In `result.json` ist `answer` kein Klartext. Die Teile
  `answer.blocks[].data_base64` base64-dekodieren, zusammenfügen und gegen `answer.sha256` prüfen.
- Eine neue Startart für Worker (z. B. pi ohne Erweiterungen, um RAM zu sparen) zuerst mit einer Ein-Zeilen-Probe
  testen (`-p "Antworte nur mit OK"`). Erst danach eine lange Sitzung damit fortsetzen. Grund: Ohne Erweiterungen
  fehlen auch die Provider- und Auth-Anpassungen, die der Eltern-Agent nutzt. Der Lauf scheitert dann sofort.
