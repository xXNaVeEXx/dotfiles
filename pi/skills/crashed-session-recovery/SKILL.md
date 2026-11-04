---
name: crashed-session-recovery
description: "Nach abgestürzter/unbenutzbarer Vorher-Session oder anhand einer Übergabe-Notiz den Projektstand rekonstruieren und fortfahren — zuerst prüfen, ob schon ein Nachfolge-Orchestrator läuft (dann nur read-only), Stand aus Tracker-Docs, Git und .tmp-Logs aufbauen, tote Session nur gezielt befragen (Session-JSONL per jq: Nutzeraufträge, letzte Meldungen, Prozess-Zuordnung), Worker-Briefs gegen aktuelle Maschinenverfügbarkeit prüfen. Use when a previous session in a repo died or became unusable and its work must continue, when told to continue from a handover note (UEBERGABE-*.md), when asked to find the predecessor session and what is still left to do, or when moving the project and its workers from an unstable machine to this one."
---

# crashed-session-recovery

# Abgestürzte/unbenutzbare Session im Projekt wieder aufnehmen

Use when a previous session in a repo died (crash, OOM, unusable) and work must continue from its state — especially long-running orchestrator projects with package trackers (Checkliste), per-package reports and worker logs.

## Verfahren (in dieser Reihenfolge)

0. **Erst prüfen, ob schon ein Nachfolger übernommen hat** — bevor irgendetwas geschrieben oder umgeschaltet wird (auch kein `git switch`/`pull`):
   Erste Zeile der Übergabe-Notiz (`ÜBERNOMMEN von …`?), Log-Ende des Projekt-Plans (`tail -30 .tmp/*/PLAN.md`), `ps -o pid,lstart,args -C pi`, Watchdog-Ziel (`.tmp/*/watchdog.env`: Pane/SID),
   jüngste Session-Dateien (`ls -t ~/.pi/agent/sessions/*/ | head`) und `git status -sb` (fremde Mid-Flight-Dateien = laufende Worker).
   Führt die EIGENE pi-PID (Endung des Task-Ordners `.pi/tasks/<SID>-<PID>/` eines eigenen bg_run) die tote Sitzung, hat der Nutzer im selben Pane `/new` gemacht: Dann bin ich der Nachfolger und übernehme voll — Watchdog-Ziel (SID) auf die neue Sitzung prüfen, ihre bg_run-Aufsichten per `bg_status` prüfen und beendete neu starten.
   Läuft ein anderer Orchestrator mit eigenen Workern: die Übergabe-Notiz ist STALE. Dann keine Worker starten (Limit/RAM, Kollision im
   selben Arbeitsbaum) und weder seinen Plan noch seine Panes anfassen. Nur read-only über Git-Objekte prüfen (`git grep HEAD -- …`, `git show HEAD:<pfad>`),
   Reste als nicht gestarteten Brief neben dessen Briefen ablegen und den Nutzer entscheiden lassen, ob der Nachfolger ihn einplant. Stimmt er zu, einplanen (und auf Wunsch beaufsichtigen) nach Skill subagent-orchestration, `references/orchestrator-aufsicht.md`.
   Fehlt der Notiz die `ÜBERNOMMEN`-Kopfzeile, sie als einzige Änderung selbst nachtragen (Nachfolger-Pane/SID, Startzeit, Verweis auf dessen Plan) —
   sonst startet die nächste Sitzung wieder mit dem alten Stand neben dem Nachfolger.
1. **Repo-Dokumente zuerst lesen, nicht die tote Session.** Das Repo IST der Stand:
   - Übergabe-Notiz der Vorgänger-Sitzung, falls vorhanden (`ls .tmp/*/UEBERGABE-*.md`), zuerst lesen — aber gegen Schritt 0 halten.
   - Tracker-Datei (z. B. `docs/CHECKLISTE.md`): Kopfzeile „Stand · Branch · letzter Commit“, Kurzübersicht, Paket-Marker (`[x]`/`🔄 läuft`).
   - Paket-Berichte (`docs/reports/*.md`): Abschnitte „3 Offen“ zeigen Reste und Fremd-Reste je Paket.
   - `docs/AGENT_BRIEF.md` o. ä.: Worker-Regeln (Build-Ort, Test-Befehle, Statuszeilen-Pflicht).
2. **Git-Dreiklang:** `git log --oneline` (was ist committet/gepusht), `git diff --stat` + `git status --short` (Mid-Flight-Arbeit; unversionierte Dateien = ganze neue Pakete), Remote-Differenz.
3. **`.tmp/*.log`-Zeitstempel** (`ls -lt .tmp/ | head`): welcher Schritt lief beim Tod? Log-Tail zeigen, nicht ganz lesen.
4. **Tote Session nur gezielt befragen:** `session_search` mit Paket-/Task-Schlüsselwörtern (FTS5, `sort:newest`), Snippets reichen. Nie eine Riesensession als Ganzes lesen (Context-Blowup). `{session_id}`-Read nur für klar eingegrenzte Bereiche. Für vollständige Listen (alle Nutzeraufträge, letzte Meldungen) die Session-JSONL direkt per `jq` auswerten — Datei finden, Prozess zuordnen, Filter-Rezepte: `references/session-jsonl.md`.
   Zuerst die Todesursache aus `stopReason`/`errorMessage` der letzten Assistant-Einträge lesen (Rezept dort). Bei Kontext-Überlauf (`prompt is too long`) die Sitzung nie fortsetzen, sondern frisch starten und den Stand aus den Dokumenten aufbauen. Grund: Jede Anfrage der alten Sitzung schickt wieder die volle Historie und scheitert erneut.
   Ob eine noch laufende Sitzung (Spur, Nachfolger) bald überläuft, am Anteil ihres Modellfensters messen (Pane-Fußzeile, z. B. `192k/1.0M (19 %)` per `herdr pane read <pane> --source visible`), nicht an der Token-Zahl allein oder an der JSONL-Größe. Grund: Die Fenster reichen je Modell von etwa 200K bis 1M, und die JSONL behält auch den schon gefalteten Verlauf — eine falsche Überlauf-Annahme führt zu einem unnötigen, teuren Frischstart.
5. **Stand dem Nutzer zusammenfassen, bevor weitergearbeitet wird** — Aufbau: gepusht / uncommittet fertig / beim Absturz laufend / danach offen / eigener Weiterfahrplan.
6. **Worker neu starten:** AGENT_BRIEF lesen, aber Maschinen-/Build-Ort-Regeln gegen die AKTUELLE Nutzer-Aussage prüfen. Wenn der Nutzer eine Maschine gesperrt/geändert hat: Abweichung explizit an den ANFANG der Aufgabe schreiben (stale Briefs leiten Builds sonst still auf tote Maschinen um). Bereits gestartete Worker sofort abbrechen und mit Override neu starten.
   - **Gestorbener Worker (SIGTERM/exit 143, Ausgabe-Wächter):** nicht neu vergeben, sondern `acp_delegate` mit `resumeFrom: <runId>` fortsetzen — stellt Session + Teilarbeit wieder her. Ausnahme: Endete er an seiner eigenen Kontextgrenze (Ergebnis „teilweise“, Sitzungsdatei mehrere MB), frisch starten und das Teilergebnis aus der Datei fortsetzen lassen (Regel im Skill subagent-orchestration), weil der fortgesetzte Worker den vollen alten Kontext lädt. Vorher Activity-Log-Ende und `git status` lesen, um die echte Restliste in die Fortsetzungs-Aufgabe zu schreiben.
   - **Beim Dispatch lange Builds ankündigen:** in die Aufgabe schreiben, dass Lange-Läufer als Hintergrundprozess mit Log gestartet und per Poll-Schleife (`sleep ≤120; tail`) begleitet werden, mit eigener Statuszeile nach jedem Schleifenschritt — sonst killt der Ausgabe-Wächter den Worker mitten im Build (Mechanismus: Stillstand ≠ Fortschritt, der Wächter sieht nur Ausgaben).
   - **Konsolidierung statt Split:** liegen mehrere fertige Pakete mit gemeinsam geänderten Dateien (Registrierungen, generierte Typen, Tracker) uncommittet herum, EIN Konsolidierungs-Commit je Konvention schreiben statt Hunk-Splitting — Zwischenstände ohne die gemeinsamen Dateien kompilieren nicht.
7. **Vor dem Commit verifizieren:** letzte grüne Testläufe aus `.tmp`-Logs bestätigen oder neu laufen lassen; mid-flight-Paket fertigstellen lassen; dann pro Paket einzeln committen in der Commit-Konvention des Repos (z. B. `feat(desktop): … (P8x)`), pushen, PR-Beschreibung auf Endstand bringen, Tracker-Doks aktualisieren.

## Variante: Ursprungssitzung finden und Restarbeit ermitteln

Wenn der Nutzer nach der Sitzung vor einer Übergabe fragt und wissen will, was noch zu tun ist:

1. **Ursprungssitzung bestimmen:** Session-Datei per `find`/mtime und Prozess-Startzeit zuordnen (`references/session-jsonl.md`); beachten, dass dieselbe pi-PID nach `/new` schon eine neue Sitzung führen kann.
2. **Ihre echten Nutzeraufträge extrahieren** (jq-Filter ohne Benachrichtigungen) und ihre letzten Text-Antworten lesen — dort stehen Übergabe, Queue des Nachfolgers und damals offene Nutzerentscheidungen.
3. **Je Auftrag den Stand bestimmen** aus Plan-Statuszeile und -Log (`.tmp/*/PLAN.md`), Tracker und Git (committet / gepusht / gemergt / PR offen).
4. **„Offen“-Notizen aus Logs und Berichten gegen die Tracker halten:** `git grep -n -I -E '<stichwort>' HEAD -- <tracker-doks>`; ohne Treffer gehört der Rest in „steht in keinem Plan“. Offene Kästchen je Abschnitt: Grenzen per `grep -n '^## \|^### '`, dann `awk 'NR>=<a> && NR<=<b> && /\[ \]|\[~\]|\[-\]/'`. Tracker-Zeilen, deren Arbeit längst gemergt ist, per `git merge-base --is-ancestor <commit> origin/main` als veraltet erkennen.
5. **Bericht:** Tabelle Auftrag → Stand, dann die Gruppen Läuft / Warteschlange (arbeitet der Nachfolger selbst ab) / Steht in keinem Plan / Braucht den Nutzer. Nicht am Code geprüfte Reste als ungeprüft kennzeichnen und jede eigene Änderung offenlegen.

## Variante: Arbeit von instabiler Maschine auf diese übernehmen

Wenn die andere Maschine ständig abstürzt und das Projekt HIER weiterlaufen soll:

1. **Dort nichts mehr laufen lassen:** per `ssh -o BatchMode=yes <host>` prüfen, dass kein pi/cargo/Watchdog mehr läuft; Nacht-Loops per Stop-Datei (z. B. `.tmp/night/DONE`) beenden, damit sie nicht parallel weiterbauen.
2. **Repo samt `.git` und uncommitteter Arbeit spiegeln** statt frisch zu klonen (Klon verliert Mid-Flight-Diffs): `rsync -a` mit Excludes für Build-Ordner (`target`, `node_modules`, `build`, `.dart_tool`) und `.tmp` nur selektiv (Briefs/Berichte/Pläne/Hilfsskripte). Worktrees ebenfalls spiegeln und danach `git worktree list` prüfen.
3. **Gleich das Zielverzeichnis wählen:** Pfad mit dem Nutzer abstimmen (Prototyp-/Sandbox-Ordner sind oft nicht der gewünschte Endort). Verschieben: `mv` Repo + Worktree, dann im Hauptrepo `git worktree repair <worktree-pfad>`; eine „gitdir incorrect“-Meldung ist harmlos, wenn `git worktree list` danach stimmt.
4. **Pfad-Referenzen umschreiben** in unversionierten Hilfsdateien (`.tmp/**/*.sh`, Briefs, COMMON-Regeln) per `sed -i 's#alt#neu#g'`; versionierte Dateien mit maschinen-spezifischen Pfaden NICHT im Vorbeigehen ändern (wären ein Fremd-Commit) — nur notieren.
5. **Remote-Build-Skripte, die auf diese Maschine zeigen** (`ssh user@<eigene-IP>`), lokal lauffähig machen: eigenen Pubkey mit `from="127.0.0.1,::1,<lan-ip>"` in `~/.ssh/authorized_keys` (vorher Backup), `ssh-keyscan` für localhost/IP in `known_hosts`, dann `ssh -o BatchMode=yes user@<ip> true` testen. So laufen die Skripte unverändert weiter.
6. **Worker nach einem Pfadwechsel frisch starten statt `resumeFrom`** (die fortgesetzte Session trägt das alte cwd mit): in der neuen Aufgabe den Teilstand benennen (`git diff --stat`, Dateien, ob schon getestet) und „prüfen, übernehmen, vervollständigen“ verlangen.
7. Umzug + neue Worker-IDs im Projekt-Plan (`PLAN.md` o. ä.) protokollieren.
8. **Fragt der Nutzer später „was hast du gemacht / Stand?“:** getrennt berichten, was die Vorgänger-Sitzung und was
   diese Sitzung geschafft hat, je Branch mit Commit-Zahl, Zeitspanne und Bedeutung. Grenze = Startzeit dieser Sitzung
   aus dem Dateinamen von `$PI_SESSION_FILE` (UTC → in Ortszeit umrechnen) gegen
   `git log --date=format-local:'%d.%m %H:%M' --format='%h %ad %s' <basis>..<branch>`. Grund: Commit-Zeiten allein
   trennen die Sitzungen nicht, und ein UTC-Dateiname gegen Ortszeit-Commits verschiebt die Grenze um den Zonenversatz.

## Stolperfallen

- Paket-Marker `🔄 läuft` sind beim Absturz STALE: Bericht vollständig + Tests grün heißt faktisch fertig — Berichte und Log-Zeitstempel schlagen Checkboxen.
- Uncommittet ≠ ungetestet: prüfe, ob die letzte Testrunde NACH der letzten Code-Änderung lief (Log-Timestamps vergleichen), sonst neu verifizieren.
- „Läuft gerade“-Pakete ohne Berichtsgerüst: Analyse-Stand steckt oft nur in `.tmp`-Logs und dem Bericht-Skeleton — beide lesen, bevor der Worker neu ansetzt.
- Cross-Paket-Notizen in Tracker-Doks („Besitzer bitte abhaken“, „fremd rot“) erst beim eigenen Doku-Pass auflösen, nicht vom Worker — sonst doppelte Bearbeitung derselben Dateien (Konflikt im Arbeitsbaum).
