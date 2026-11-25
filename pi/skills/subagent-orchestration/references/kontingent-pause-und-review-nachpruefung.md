# Kontingent-Pause, Wiederanlauf und Review-Pflicht (Ergänzung zu spur-orchestrator-betrieb.md)

## Kontingent-Pause (Leitstand sperrt den Anbieter für Tage)
- Pause-Datei der Spur (`spuren/<Spur>/PAUSE`, Inhalt: Ende-Epoch, Anbieter, Schwelle) bedeutet: keine neuen Worker, Reviewer,
  Nacharbeiten oder Nachprüf-Bündel. Laufende Läufe enden lassen, fertige Pakete noch einbauen (kein halbfertiger Worktree
  über Tage). Vorher eine Journalzeile mit der Reihenfolge NACH der Pause schreiben, danach genau einen Herzschlag:
  `warte.sh <Spur> --quota <anbieter> --max <Sekunden bis Pausenende>` als `bg_run` (surviveReload, Timeout = max + 600 s),
  keine Stunden-Einträge im Journal.
- Während der Pause kommen Wächter-Meldungen („seit N min kein Fortschritt“, „Lauf endete technisch: HTTP 429/424
  `bili_throttle_hold|terminal`“). Das ist die Proxy-Drosselung bei vollem Wochenkontingent, kein Fehler der Spur: nicht
  nachforschen, nicht `compress` aufrufen, nichts neu starten.
- Nach Pausenende (Leitstand meldet „frei“): zuerst `date`, `quota.sh -v <anbieter>` (Exit 0), `git fetch` + `git status -sb`
  in `int`, `git worktree list`, `next`. Dann PAUSE-Datei löschen, erste Journalzeile als Quittung mit dem ersten Start.
  Journal-Uhrzeiten immer per `date` erzeugen, nie schätzen.

## Review-Modell ist immer das ANDERE Modell
- Worker opus → Reviewer sonnet; Worker sonnet → Reviewer opus. Das gilt auch für Nachprüfung bereits eingebauter Pakete:
  Bündel nach Bau-Modell trennen (opus-gebaute Pakete mit sonnet prüfen, sonnet-gebaute mit opus), nicht ein Modell für alles.
  Journal-Zeile nennt das Review-Modell konkret, nie „opus/opus“.
- Reviewer-Subagenten haben kein Schreibwerkzeug und keinen git-Zugriff: Auftrag „nur lesen, keine Tests“, Antwort als Markdown
  mit fester Kopfzeile und Schlusszeile `BEFUND: <n> P1, <m> P2`; Ergebnis mit einem Python-Lauf über `events.jsonl` des
  async-Verzeichnisses extrahieren (längster Assistant-Text, der `BEFUND` enthält; rekursiv durch alle Objekte laufen, Rolle
  `assistant`, Teile vom Typ `text`) und nach `spuren/<Spur>/nacharbeit/REVIEW-<WP>.md` schreiben. „Nichts gespeichert“ als
  Endmeldung des Reviewers ist Lernpass-Rauschen; im Auftrag „KEIN Lernpass, nichts speichern“ voranstellen.
- Reviewer-Auftrag mit Prüfraster aus den früheren REVIEW-Dateien (Pfade nennen) + paketspezifischen Hotspots, Diff-Basis
  (`git diff <letzter Integrationscommit> HEAD`) und Pfadliste; bei bereits integrierten Paketen Integrationscommit-Hashes
  je Paket angeben (`git log --grep 'integrate LC-WP-…'`). Das spart dem Reviewer die Suche.
- Platz-Reihenfolge: ein Reviewer zählt als Claude-Worker. Wird nach Abnahme eines Pakets der Platz frei, geht er an die vom
  Leitstand priorisierte Prüfung (Nachprüf-Bündel) vor dem nächsten Bau-Paket; Fairness-Platz-Meldungen der Schwesterspur
  heißen „jetzt `next` ausführen und starten“, ggf. mit `.pfade` als Kopie eines Geschwister-Pakets derselben Crate.

## Nacharbeit nach Review (P1 → Worker im selben Worktree)
- Brief `nacharbeit/<WP>-nacharbeit.md`: P1 mit Pflicht-Regressionstest (vorher rot), günstige P2 (je ≤ 1 h) angehängt, Verweis
  auf die Review-Datei. Status `nacharbeit <runId> <modell>`, danach wie üblich `abnahme`, `check --bg`, `wait check`, `integ`.
  Auch bei 0 P1 lohnt Nacharbeit, wenn P2 Zugriffskontrolle/Fristen berühren, bevor der Baustein verdrahtet wird.
- Abnahme der Nacharbeit: Check-Log-`WPQ_HEAD` gegen `git diff --name-only <WPQ_HEAD> HEAD` halten (nur Bericht erlaubt),
  alle `STEP … EXIT=0`, Bericht-Schlusszeile `ERGEBNIS: fertig`; Offen-Punkte des Reviews, die nicht erledigt wurden, als
  Pflichtpunkt in das Sammel-Verdrahtungspaket übernehmen.
- Neue Krypto-/Netz-Abhängigkeiten (z. B. Ed25519) nur in der Manifest-Datei der eigenen Crate mit fester Version (`=x.y.z`)
  und über die `.pfade`-Freigabe; vorher `grep` im Cargo.lock, ob sie schon im Baum liegen.
- Typische P1-Muster solcher Netz-/Gateway-Pakete, die jeder neue Brief gleich mitnennen sollte: Signatur nur auf Vorhandensein
  statt kryptografisch geprüft (Tests mit Platzhalter-Signatur fälschen das Ergebnis), Größenprüfung erst NACH dem Parsen,
  Frist/Abbruch des Aufrufers nicht an den Kern durchgereicht, unbegrenzte Tabellen (Sitzungs-/Versuchs-/Ticket-Maps ohne TTL),
  Host-/Bearer-Prüfung als Handler-Code statt als Schicht VOR den Body-Extraktoren (axum `Json` läuft vor dem Funktionskörper),
  Agenten-Werkzeuge (edit/delete/react/search) ohne Bindung an die eigene Konversation, Dedup-Schlüssel ohne Absender/Ziel,
  Namens→ID-Auflösung bei Mehrdeutigkeit fail-open statt fail-closed.
