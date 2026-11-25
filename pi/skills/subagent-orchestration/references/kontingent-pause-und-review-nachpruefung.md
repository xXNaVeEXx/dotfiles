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
  Bündel nach Bau-Modell trennen (opus-gebaute Pakete mit sonnet prüfen, sonnet-gebaute mit opus), nicht ein Modell für alles;
  gemischte Bündel (z. B. Slack-Pakete mit einzelnen opus-Bauten) als zwei Reviewer-Läufe (b-opus / b-sonnet) schneiden.
  Journal-Zeile nennt das Review-Modell konkret, nie „opus/opus“.
- Reviewer-Subagenten haben kein Schreibwerkzeug und keinen git-Zugriff: Auftrag „nur lesen, keine Tests“, Antwort als Markdown
  mit fester Kopfzeile und Schlusszeile `BEFUND: <n> P1, <m> P2`; Ergebnis mit einem Python-Lauf über `events.jsonl` des
  async-Verzeichnisses extrahieren (längster Assistant-Text, der `BEFUND` enthält; rekursiv durch alle Objekte laufen, Rolle
  `assistant`, Teile vom Typ `text`) und nach `spuren/<Spur>/nacharbeit/REVIEW-<WP>.md` schreiben. „Nichts gespeichert“ als
  Endmeldung des Reviewers ist Lernpass-Rauschen; im Auftrag „KEIN Lernpass, nichts speichern“ voranstellen.
- Reviewer-Auftrag mit Prüfraster aus den früheren REVIEW-Dateien (Pfade nennen) + paketspezifischen Hotspots, Diff-Basis
  (`git diff <letzter Integrationscommit> HEAD`) und Pfadliste; bei bereits integrierten Paketen Integrationscommit-Hashes
  je Paket angeben (`git log --grep 'integrate LC-WP-…'`). Das spart dem Reviewer die Suche. Bei Bündeln (viele Pakete) den
  Auftrag als Datei `nacharbeit/NACHPRUEF-<bündel>-auftrag.md` ablegen (Pfade, Schwerpunkte, Erbauer-Modell je Paket) und dem
  Reviewer nur „lies den Auftrag + ein Stil-Vorbild“ geben; so bleibt der Subagent-Task kurz und der Auftrag wiederverwendbar.
- Bündel-Reviewer-Zelle: Hat ein Nachprüf-Bündel kein eigenes Queue-Paket, den Lauf in der Zelle eines enthaltenen, bereits
  fertigen Pakets als `nacharbeit review läuft <runId> <modell>` führen (zählt als Claude-Platz) und nach dem Review die Zelle
  zurück auf `fertig` setzen; sonst sieht der Platzzähler den Lauf nicht.
- Platz-Reihenfolge: ein Reviewer zählt als Claude-Worker. Wird nach Abnahme eines Pakets der Platz frei, geht er an die vom
  Leitstand priorisierte Prüfung (Nachprüf-Bündel) vor dem nächsten Bau-Paket – auch wenn `next` ein Bau-Paket vorschlägt: die
  ausdrückliche L0-Reihenfolge („im Wechsel Bau-Paket / Bündel“) schlägt die Empfehlung von `next`; vorher die Journalzeile mit der
  Reihenfolge als Quittung schreiben. Fairness-Platz-Meldungen der Schwesterspur
  heißen „jetzt `next` ausführen und starten“, ggf. mit `.pfade` als Kopie eines Geschwister-Pakets derselben Crate.
  Ist kein Platz frei, Brief/Worktree/`.pfade` trotzdem sofort fertigmachen und in der Journalzeile „startet beim nächsten
  freien Platz“ vermerken – dann kostet der Start später nur noch einen Aufruf.
- Rust-Schlüsselwörter als Modulordner (`loop`, `type`, …): der Modul-Scan erzeugt `r#loop`; das kompiliert ohne Eingriff, auch im
  Testkit – dem Worker im Brief mitgeben, nur bei Fehlern per Supervisor melden.

## Nacharbeit nach Review (P1 → Worker im selben Worktree)
- Brief `nacharbeit/<WP>-nacharbeit.md`: P1 mit Pflicht-Regressionstest (vorher rot, Rot-Log nach `.tmp/` des Worktrees),
  günstige P2 (je ≤ 1 h) angehängt, Verweis auf die Review-Datei. Status `nacharbeit <runId> <modell>`, danach wie üblich
  `abnahme`, `check --bg`, `wait check`, `integ`. Auch bei 0 P1 lohnt Nacharbeit, wenn P2 Zugriffskontrolle/Fristen berühren,
  bevor der Baustein verdrahtet wird.
- Sammel-Nachprüf-Fix über mehrere bereits integrierte Pakete: EIN Worktree (der des Pakets mit den P1), `.pfade` um die
  Pfade der übrigen Pakete ergänzen, `git merge feat/lumi-claw` vorab, ein Bericht `NACHPRUEF-<Bündel>.md`; Abnahme/Integ
  läuft über die Zelle dieses einen Pakets.
- Abnahme der Nacharbeit: Check-Log-`WPQ_HEAD` gegen `git diff --name-only <WPQ_HEAD> HEAD` halten (nur Bericht erlaubt),
  alle `STEP … EXIT=0`, Bericht-Schlusszeile `ERGEBNIS: fertig`; Offen-Punkte des Reviews, die nicht erledigt wurden, als
  Pflichtpunkt in das Sammel-Verdrahtungspaket übernehmen.
- Neue Abhängigkeiten (Krypto, Netz, Prozessinfo wie `sysinfo`) nur in der Manifest-Datei der eigenen Crate mit fester Version
  und über die `.pfade`-Freigabe; vorher `grep` im Cargo.lock, ob sie schon im Baum liegen. Eine Positivliste erlaubter
  Abhängigkeiten im Quelltext (Wächtertest wie `trust_gate`) schlägt dann fehl: Worker fragt per Supervisor; Antwort = die
  Liste um genau diese Zeile erweitern (Länge des Arrays anpassen), Ausnahme in ENTSCHEIDUNGEN.md und im Bericht nennen.
- PID-/Prozess-Identität (Gateway-Dienst): Zustandsdatei braucht Startzeit + Programmpfad neben der PID, vor JEDEM Signal
  vergleichen; Felder mit `#[serde(default)]`, fehlende Angabe = „veraltet, nicht signalisieren“. Linux per `/proc`, andere
  Systeme per `sysinfo` unter `cfg(not(linux))`; dort nur kompiliert/mit Attrappen getestet → im Bericht „Offen“ führen.
- Typische P1-Muster solcher Netz-/Gateway-Pakete, die jeder neue Brief gleich mitnennen sollte: Signatur nur auf Vorhandensein
  statt kryptografisch geprüft (Tests mit Platzhalter-Signatur fälschen das Ergebnis), Größenprüfung erst NACH dem Parsen,
  Frist/Abbruch des Aufrufers nicht an den Kern durchgereicht, unbegrenzte Tabellen (Sitzungs-/Versuchs-/Ticket-Maps ohne TTL),
  Host-/Bearer-Prüfung als Handler-Code statt als Schicht VOR den Body-Extraktoren (axum `Json` läuft vor dem Funktionskörper),
  Agenten-Werkzeuge (edit/delete/react/search) ohne Bindung an die eigene Konversation, Dedup-Schlüssel ohne Absender/Ziel,
  Namens→ID-Auflösung bei Mehrdeutigkeit fail-open statt fail-closed, Webhook-Prüfung (Signatur/Token) die ohne konfiguriertes
  Geheimnis `true` liefert, Prozess-Signale an eine gespeicherte PID ohne Identitätsprüfung.
- Weitere wiederkehrende Funde (auch P2, die Bausteine vor dem Verdrahten treffen): Zähler-/Bremsen-Logik mit leerer oder
  fehlender Ereignis-ID (jede Nachricht muss zählen), Normalisierung (trim + ASCII-Kleinschreibung) für Schlüssel von Paaren/
  Allowlists, Bereinigung mit dem Fenster des Aufrufers statt des eigenen Fensters, Verlaufszeilen mit fremdem Text ohne
  Einrücken von Zeilenumbrüchen (Fälschung menschlicher Zeilen), `#[derive(Debug)]` auf Typen mit Token/Geheimnis, Polling-Position
  rückt trotz fehlgeschlagenem Speichern vor (Update verloren), Giftnachricht ohne Versuchszähler/Dead-Letter blockiert die
  Queue, Befehle (z. B. `/pair`) vor der DM-Policy-Prüfung ausgeführt, `retry_after`/Wartezeit ungeprüft (Überlauf, Budget),
  `secret:`-Verweise der Konfiguration von einzelnen Kanälen nie aufgelöst, atomares Schreiben (tmp + rename) setzt Dateirechte
  auf 0644 zurück (tmp mit Modus 0600 anlegen).
