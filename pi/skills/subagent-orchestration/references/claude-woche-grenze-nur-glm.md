# Claude-Woche nahe der Grenze – Leitstand: „neue Pakete nur noch glm“

- Journal-Quittung mit dem nächsten glm-Paket: nicht aus der Queue-Spalte „Modell“ raten. Viele glm-Pakete hängen an
  Claude-Paketen (gesperrter Vorgänger), und Abhängigkeiten anderer Wellen/Spuren sieht eine Queue-Auswertung nicht.
  Verbindlich ist nur `wpq.py next`; bei vollen Plätzen („voll: 2/2“) „voraussichtlich … (Abhängigkeiten prüft next)“ schreiben.
- „Nur glm“ heißt: glm baut nur Pakete mit Modell-Spalte glm. Pakete mit Spalte opus/sonnet nie ersatzweise mit glm
  starten (auch wenn `next` „glm (statt opus: schon 2 anthropic-Kinder)“ anbietet, wenn der Leitstand das ausschließt) –
  sie warten auf Claude; ist kein glm-Paket startbar, bleibt der Platz leer. Wurde ein Sicherheits-Baustein trotzdem mit glm
  gebaut, verlangt der Leitstand vor dem Einbau eine opus-Prüfung (Sicherheit/echte Fehler, Vorrang vor anderen Claude-Läufen)
  und startet keine abhängigen Pakete vor dem Einbau.
- Jedes fertige glm-Paket braucht sofort einen Claude-Prüfer (zählt gegen die Claude-Grenze und die Höchstzahl Claude-Läufe) –
  einplanen. Prüfer mit dem billigeren Claude-Modell, wo der Brief nichts anderes verlangt. Ist das Claude-Tor zu: abnehmen,
  Endlauf fahren, Queue-Zelle „wartet auf Claude-Prüfung“, nicht einbauen.
- Ist das Claude-Tor ganz zu (`quota.sh anthropic` meldet NEIN), bietet `wpq.py next` Claude-Pakete als „glm (statt
  sonnet: anthropic-Kontingent)“ an – das ist die Ausweichregel des Werkzeugs, keine Freigabe. Bei der Weisung „nur Pakete
  mit Modell-Spalte glm“ das Angebot NICHT starten, Zelle „bleibt zurück“ setzen, Journalzeile. Schon gelaufene
  Claude-Prüfungen bleiben gültig: deren Paket darf auch bei geschlossenem Tor eingebaut werden.
- Dem Reviewer nie einen Schreibauftrag („schreibe nach <Datei>“) geben: er hat kein Schreibwerkzeug und meldet das als Text.
  Den Volltext selbst aus `session.jsonl` des Reviewer-Laufs ziehen (letzter Assistant-Text, der `REVIEW:` enthält) und in die
  Review-Datei schreiben; die Benachrichtigung enthält oft nur Lernpass-Rauschen.
- „check läuft (N min)“ über 60 min bei gleichzeitigen Bauten mehrerer Spuren auf dem Remote-Rechner ist Warteschlange, kein
  Hänger: `ps -eo pid,etimes,args | grep -E 'wpq.py check|rb.sh'` – solange `rb.sh --_inner`-Prozesse laufen, nichts tun.
  Ein Herzschlag mit `WARTE-ENDE herzschlag` ist nur der Zeitablauf: Stand lesen, neu starten, keine Meldung an den Nutzer nötig.
- glm-Worker mit Commit-Hook: Betreff muss Conventional Commits folgen und ≤ 72 Zeichen sein (sonst „BLOCKED“, auch beim
  Orchestrator-Sicherungscommit) – steht die Regel nicht im Brief, scheitert der Worker mehrfach und löst „repeated mutating
  tool failures“ aus; meist korrigiert er selbst, erst `git log` ansehen. Läuft ein glm-Worker ins Zeitlimit, war die Arbeit
  oft fertig: Rest selbst sichern (`git add` der Paketpfade, Commit), `wpq.py abnahme`, dann Endlauf.
- Fragt ein Worker per Supervisor-Anfrage nach einer Entscheidung (z. B. generiertes Handbuch außerhalb der eigenen Pfade
  → `abnahme` meldet „Dateien außerhalb der eigenen Pfade“): selbst nach dem Muster eines früheren Pakets entscheiden
  (`$C/vorgaben/<WP>.pfade` anlegen, eine Zeile je Pfad), Journalzeile, dann
  `subagent_supervisor({action:"reply", replyTo:<id aus der Meldung>, message})`.
- Endlauf-Schritt `nextest EXIT=255` ohne Fehlertext (Log endet mitten im Kompilieren) = abgebrochen (RAM/Remote), kein
  Codefehler: Schritt neu fahren, nicht blind ändern. Rote UI-Last-Flakes (Zeit-Schwellen-Tests wie „2000 Zeilen < 200 ms“)
  getrennt von eigenen roten Tests (i18n-Platzhalter, Design-Wächter) benennen und dem Worker per `steer` beides mitgeben.
- `wpq.py integ` bricht am Tor „MANGEL Bericht: ERGEBNIS: teilweise …“ ab (strikte Prüfung; `abnahme` warnt nur): Die
  Schlusszeile des Berichts muss `ERGEBNIS: fertig – …` lauten, „bewusst offen“ gehört in den Text der Zeile. Als reiner
  Docs-Commit im Worker-Worktree korrigieren (Betreff ≤ 72 Zeichen), `abnahme`, `integ` neu.
- Roter Schritt nach dem Merge mit `couldn't read …/<Modul>/mod.rs: No such file or directory`, obwohl das Modul im eigenen
  Diff nicht vorkommt, ist kein Paketfehler: Der Remote-Spiegel eines Slots (`~/lumi-claw-<slot>/repo`) wird von mehreren
  Worktrees gleichzeitig beschrieben, ein fremder Lauf hinterlässt `pub mod x;` ohne Datei. `pgrep -af 'rb.sh --_inner'`
  zeigt die Läufe je Slot; `integ` wiederholen, wenn dort nichts mehr läuft. Wird es bei freiem Slot erneut rot, als
  „offen für L0“ mit Log-Namen melden.
